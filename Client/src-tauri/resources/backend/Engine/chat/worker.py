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
    remove_active_chat_session_broker,
)
from .memory import (
    get_session_memory,
    get_entire_session_history,
    store_session_memory,
    format_chat_history_for_llm,
)
from .websocket import ws_manager
from .naming import chat_naming_queue
from .workflow import run_chat_workflow
from config import get_user_profile
from llm import call_llm
from vault_logger import log, log_error, mask_sensitive

logger = logging.getLogger("mira.engine.chat.worker")


async def process_chat_job(job: Dict[str, Any], worker_id: int = 1) -> bool:
    """
    Process a single chat job from llm_chat stream using LangGraph agentic workflow:
      1. Retrieve session's chat history and active user profile.
      2. Execute LangGraph workflow (decision, user activity / general LLM, response synthesis).
      3. Store the user query and AI response in the Vault chat table.
      4. Store the conversation in Redis short-term memory.
      5. Send the response to the Client through WebSockets using existing job_id and session_id.
      6. Automatic chat naming and Message Broker job acknowledgment.
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

    # Step 1: Retrieve chat history and user profile from memory
    history = await asyncio.to_thread(get_entire_session_history, session_id)
    if not history:
        history = await asyncio.to_thread(get_session_memory, session_id)
    user_profile = await asyncio.to_thread(get_user_profile)
    log(f"[ChatWorker-{worker_id}] Retrieved {len(history)} history turns for user '{user_profile.get('user_name', 'User')}' (session {session_id})")

    # Step 2: Execute LangGraph agentic workflow
    ai_response = ""
    from config import CONFIG
    if not CONFIG.has_any_llm_key(force_refresh=True):
        log_error(f"[ChatWorker-{worker_id}] No LLM API keys configured. Rejecting workflow execution for job {job_id}.")
        ai_response = (
            "You don't have any LLM API keys configured. You cannot send messages until you add an LLM key "
            "in Configurations > AI Config (/configurations/ai-config)."
        )
    else:
        try:
            ai_response = await run_chat_workflow(
                job_id=job_id,
                session_id=session_id,
                user_query=user_query,
                chat_history=history,
                user_profile=user_profile,
            )
        except Exception as e:
            log_error(f"[ChatWorker-{worker_id}] Workflow failed for job {job_id}: {mask_sensitive(str(e))}")
            user_name = user_profile.get("user_name", "there")
            ai_response = (
                f"I apologize {user_name}, but I was unable to complete your request at this moment. "
                "Please check your configured AI provider keys in Configurations > AI Config."
            )


    # Step 3: Resolve user message reference and store AI response in Vault
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    pre_saved_user = job.get("user_message")
    user_msg_id = job.get("user_message_id")

    if pre_saved_user and isinstance(pre_saved_user, dict):
        saved_user = pre_saved_user
    elif user_msg_id:
        saved_user = {
            "id": user_msg_id,
            "session_id": session_id,
            "role": "user",
            "content": user_query,
            "chat_name": chat_name,
            "created_at": now_str,
        }
    else:
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

    # Step 6: Automatic Chat Naming - If chat_name is null or empty, enqueue for naming
    if not chat_name or not str(chat_name).strip():
        chat_naming_queue.enqueue(session_id)

    # Step 7: Acknowledge and remove job from Message Broker & Redis active tracking
    removed = await asyncio.to_thread(acknowledge_chat_job, job_id)
    if not removed:
        log_error(f"[ChatWorker-{worker_id}] Warning: Failed to acknowledge job {job_id}")
    await asyncio.to_thread(remove_active_chat_session_broker, session_id)

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

        # Start the in-memory chat naming queue processor
        await chat_naming_queue.start()

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
        await chat_naming_queue.stop()
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
