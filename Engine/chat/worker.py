from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
import uuid

from .config import (
    get_chat_workers_count,
    get_chat_poll_time,
)
from .broker_client import (
    poll_chat_jobs,
    acknowledge_chat_job,
    save_chat_to_vault,
)
from .memory import (
    get_session_memory,
    store_session_memory,
    format_chat_history_for_llm,
)
from .websocket import ws_manager
from llm import call_llm
from vault_logger import log, log_error, mask_sensitive

logger = logging.getLogger("mira.engine.chat.worker")


async def process_chat_job(job: Dict[str, Any], worker_id: int = 1) -> bool:
    """
    Process a single chat job from llm_chat stream:
      1. Retrieve session's chat history using the short-term memory script.
      2. Call the existing LLM script with the user query and chat history.
      3. Send the response to the Client through WebSockets using existing job_id and session_id.
      4. Store the user query and AI response in the Vault chat table.
      5. Store the conversation in Redis short-term memory.
    """
    job_id = job.get("job_id")
    session_id = job.get("session_id")
    user_query = job.get("user_query") or job.get("content") or ""
    chat_name = job.get("chat_name")

    if not job_id:
        log_error(f"[ChatWorker-{worker_id}] Job missing 'job_id', skipping.")
        return False
    if not session_id:
        session_id = str(uuid.uuid4())
    if not user_query:
        log_error(f"[ChatWorker-{worker_id}] Job {job_id} missing 'user_query', skipping.")
        acknowledge_chat_job(job_id)
        return False

    log(f"[ChatWorker-{worker_id}] Processing job {job_id} for session {session_id}...")

    # Step 1: Retrieve session's chat history from short-term memory
    history = await asyncio.to_thread(get_session_memory, session_id)
    log(f"[ChatWorker-{worker_id}] Retrieved {len(history)} short-term memory turns for session {session_id}")

    # Step 2: Format history with user query and call existing LLM script
    prompt = format_chat_history_for_llm(history, user_query)
    ai_response = ""
    try:
        ai_response = await asyncio.to_thread(call_llm, prompt, "chat")
    except Exception as e:
        log_error(f"[ChatWorker-{worker_id}] LLM call failed for job {job_id}: {mask_sensitive(str(e))}")
        ai_response = (
            "I apologize, but I was unable to complete your request at this moment. "
            "Please check your configured AI provider keys in Configurations > AI Config."
        )

    # Step 3: Store user query and AI response in Vault chats table
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    saved_user = await asyncio.to_thread(
        save_chat_to_vault,
        session_id=session_id,
        role="user",
        content=user_query,
        chat_name=chat_name,
    )
    if not saved_user:
        saved_user = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "user",
            "content": user_query,
            "chat_name": chat_name,
            "created_at": now_str,
        }

    saved_ai = await asyncio.to_thread(
        save_chat_to_vault,
        session_id=session_id,
        role="ai",
        content=ai_response,
        chat_name=chat_name,
    )
    if not saved_ai:
        saved_ai = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "ai",
            "content": ai_response,
            "chat_name": chat_name,
            "created_at": now_str,
        }

    # Step 4: Store conversation in Redis short-term memory
    await asyncio.to_thread(store_session_memory, session_id, user_query, ai_response)

    # Step 5: Send response to the Client through WebSockets using existing job_id and session_id
    await ws_manager.broadcast_chat_response(
        job_id=job_id,
        session_id=session_id,
        user_message=saved_user,
        ai_message=saved_ai,
        status="completed",
    )

    # Step 6: Acknowledge and remove job from Message Broker
    removed = await asyncio.to_thread(acknowledge_chat_job, job_id)
    if not removed:
        log_error(f"[ChatWorker-{worker_id}] Warning: Failed to acknowledge job {job_id}")

    log(f"[ChatWorker-{worker_id}] Successfully finished job {job_id} for session {session_id}")
    return True


class ChatWorkerManager:
    """
    Manages parallel chat worker tasks polling the llm_chat consumer group.
    """

    def __init__(self):
        self._running: bool = False
        self._tasks: List[asyncio.Task] = []
        self._total_jobs_processed: int = 0

    def is_running(self) -> bool:
        return self._running

    async def start(self) -> bool:
        if self._running:
            return True
        self._running = True

        # Fetch chat_workers and chat_workers_poll_time from Vault configuration
        num_workers = get_chat_workers_count()
        poll_interval = get_chat_poll_time()

        log(f"Starting {num_workers} parallel Chat workers (poll_interval={poll_interval}s)...")
        self._tasks = []
        for i in range(1, num_workers + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)
        return True

    async def stop(self) -> None:
        if not self._running:
            return
        log("Stopping Chat workers...")
        self._running = False
        for task in self._tasks:
            try:
                task.cancel()
            except Exception:
                pass
        if self._tasks:
            try:
                current_loop = asyncio.get_running_loop()
                active_tasks = [
                    t for t in self._tasks
                    if not t.done() and (not t.get_loop().is_closed()) and (t.get_loop() == current_loop)
                ]
                if active_tasks:
                    await asyncio.gather(*active_tasks, return_exceptions=True)
            except Exception:
                pass
            self._tasks = []
        log("All Chat workers stopped.")

    async def _worker_loop(self, worker_id: int) -> None:
        log(f"[ChatWorker-{worker_id}] Online and polling 'llm_chat' stream...")
        while self._running:
            try:
                poll_interval = get_chat_poll_time()
                jobs = await asyncio.to_thread(poll_chat_jobs, 1)

                if not jobs:
                    await asyncio.sleep(poll_interval)
                    continue

                for job in jobs:
                    success = await process_chat_job(job, worker_id=worker_id)
                    if success:
                        self._total_jobs_processed += 1

                await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[ChatWorker-{worker_id}] Error in worker loop: {e}")
                await asyncio.sleep(2.0)
        log(f"[ChatWorker-{worker_id}] Worker loop exited.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "active_workers": len(self._tasks) if self._running else 0,
            "configured_workers": get_chat_workers_count(),
            "poll_interval": get_chat_poll_time(),
            "total_jobs_processed": self._total_jobs_processed,
            "active_ws_connections": ws_manager.get_connections_count(),
        }


worker_manager = ChatWorkerManager()


async def start_chat_workers() -> bool:
    return await worker_manager.start()


async def stop_chat_workers() -> None:
    await worker_manager.stop()


def get_chat_status() -> Dict[str, Any]:
    return worker_manager.get_status()
