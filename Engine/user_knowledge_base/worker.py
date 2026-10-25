from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import collections
from .config import (
    DEFAULT_BATCH_SIZE,
    get_kb_workers_count,
    get_kb_workers_poll_time,
)
from .broker_client import fetch_user_from_vault, poll_jobs, remove_jobs_batch
from .extractor import extract_user_info_from_batch
from .storage import (
    save_extracted_batch,
    update_user_identity,
    get_user_identity,
)
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.user_knowledge_base.worker")


class UserKnowledgeBaseWorkerManager:
    """
    Manages parallel background workers that consume jobs from the
    'user_knowledge_base' Redis stream via Message Broker, extract user
    preferences/facts using the LLM, and persist them into the encrypted Knowledge Base.
    Does NOT store messages or jobs in the database.
    """

    def __init__(self) -> None:
        self._running: bool = False
        self._tasks: List[asyncio.Task] = []
        self.batch_size: int = DEFAULT_BATCH_SIZE
        self._total_jobs_processed: int = 0
        self._total_batches_processed: int = 0
        self._last_processed_at: Optional[float] = None
        self._last_vault_sync_at: float = 0.0
        self._last_known_user_hash: str = ""
        # Bounded in-memory queue to prevent duplicate in-flight processing without storing jobs in DB
        self._recent_job_ids: collections.deque[str] = collections.deque(maxlen=2000)
        self._recent_job_set: set[str] = set()

    def is_job_recent(self, job_id: str) -> bool:
        return str(job_id) in self._recent_job_set

    def mark_job_recent(self, job_id: str) -> None:
        jid = str(job_id).strip()
        if not jid:
            return
        if len(self._recent_job_ids) == self._recent_job_ids.maxlen:
            oldest = self._recent_job_ids.popleft()
            self._recent_job_set.discard(oldest)
        self._recent_job_ids.append(jid)
        self._recent_job_set.add(jid)

    def is_running(self) -> bool:
        return self._running

    async def start(self) -> bool:
        if self._running:
            return True
        self._running = True
        num_workers = get_kb_workers_count()
        poll_interval = get_kb_workers_poll_time()

        log(
            f"[UserKnowledgeBase] Starting {num_workers} background workers "
            f"(batch_size={self.batch_size}, poll_interval={poll_interval}s)..."
        )
        self._tasks = []
        for i in range(1, num_workers + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)
        return True

    async def stop(self) -> None:
        if not self._running:
            return
        log("[UserKnowledgeBase] Stopping background workers...")
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
                    t
                    for t in self._tasks
                    if not t.done()
                    and not t.get_loop().is_closed()
                    and t.get_loop() == current_loop
                ]
                if active_tasks:
                    await asyncio.gather(*active_tasks, return_exceptions=True)
            except Exception:
                pass
            self._tasks = []
        log("[UserKnowledgeBase] All background workers stopped.")

    async def sync_vault_user_profile(self, user_override: Optional[Dict[str, Any]] = None) -> bool:
        """
        Fetch user details from Vault (or use provided override) and update Knowledge Base.
        """
        user_data = user_override or await asyncio.to_thread(fetch_user_from_vault)
        if not user_data or not isinstance(user_data, dict):
            return False

        user_repr = f"{user_data.get('user_name')}:{user_data.get('email')}:{user_data.get('city')}:{user_data.get('country')}"
        if user_repr == self._last_known_user_hash and not user_override:
            return True

        updated = await asyncio.to_thread(update_user_identity, user_data)
        if updated:
            self._last_known_user_hash = user_repr
            self._last_vault_sync_at = time.time()
            log(
                f"[UserKnowledgeBase] Synchronized user identity from Vault: "
                f"{user_data.get('user_name', 'Unknown')} ({user_data.get('email', 'No email')})"
            )
            return True
        return False

    async def _worker_loop(self, worker_id: int) -> None:
        log(f"[KBWorker-{worker_id}] Worker online and listening for 'user_knowledge_base' jobs...")
        idle_cycles = 0

        while self._running:
            try:
                poll_interval = get_kb_workers_poll_time()
                # 1. Periodic Vault user sync check (every ~30 idle cycles or ~30s)
                idle_cycles += 1
                if idle_cycles >= 30 or (time.time() - self._last_vault_sync_at > 30.0):
                    idle_cycles = 0
                    try:
                        await self.sync_vault_user_profile()
                    except Exception as e:
                        logger.debug(f"[KBWorker-{worker_id}] Periodic Vault sync check failed: {e}")

                # 2. Poll jobs from Message Broker
                jobs = await asyncio.to_thread(poll_jobs, self.batch_size)
                if not jobs:
                    await asyncio.sleep(poll_interval)
                    continue

                log(f"[KBWorker-{worker_id}] Retrieved {len(jobs)} jobs from 'user_knowledge_base' stream.")

                # 3. Filter out already processed jobs
                valid_jobs: List[Dict[str, Any]] = []
                already_processed_ids: List[str] = []
                for j in jobs:
                    jid = str(j.get("job_id", "")).strip()
                    if not jid:
                        continue
                    if self.is_job_recent(jid):
                        already_processed_ids.append(jid)
                    else:
                        valid_jobs.append(j)

                if already_processed_ids:
                    log(
                        f"[KBWorker-{worker_id}] Skipping and removing {len(already_processed_ids)} "
                        f"already-processed jobs: {already_processed_ids}"
                    )
                    await asyncio.to_thread(remove_jobs_batch, already_processed_ids)

                if not valid_jobs:
                    await asyncio.sleep(poll_interval)
                    continue

                # 4. Extract user info via LLM for the batch
                start_time = time.time()
                extracted_data = await asyncio.to_thread(extract_user_info_from_batch, valid_jobs)

                if extracted_data is None:
                    # Extraction failed (e.g. LLM failure) -> preserve jobs in stream for retry
                    log_error(
                        f"[KBWorker-{worker_id}] LLM extraction failed for batch of {len(valid_jobs)} jobs. "
                        f"Preserving jobs in stream for retry."
                    )
                    await asyncio.sleep(3.0)
                    continue

                # 5. Persist extracted info into Knowledge Base
                stats = await asyncio.to_thread(
                    save_extracted_batch, extracted_data
                )

                # 6. Mark as recent in memory and acknowledge/remove jobs from Message Broker
                job_ids = [str(j.get("job_id")) for j in valid_jobs]
                for jid in job_ids:
                    self.mark_job_recent(jid)

                removed_dict = await asyncio.to_thread(remove_jobs_batch, job_ids)
                unacknowledged = [jid for jid, ok in removed_dict.items() if not ok]
                if unacknowledged:
                    log_error(
                        f"[KBWorker-{worker_id}] Warning: output saved but failed to acknowledge "
                        f"some jobs: {unacknowledged}"
                    )

                elapsed = time.time() - start_time
                self._total_jobs_processed += len(valid_jobs)
                self._total_batches_processed += 1
                self._last_processed_at = time.time()
                log(
                    f"[KBWorker-{worker_id}] Successfully processed batch of {len(valid_jobs)} jobs in {elapsed:.2f}s. "
                    f"KB Stats: {stats}"
                )

                # Brief yield between batches to keep loop responsive
                await asyncio.sleep(0.05)

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[KBWorker-{worker_id}] Unhandled error in worker loop: {e}")
                await asyncio.sleep(2.0)

        log(f"[KBWorker-{worker_id}] Worker loop exited.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "num_workers": len(self._tasks) if self._running else 0,
            "configured_workers": get_kb_workers_count(),
            "batch_size": self.batch_size,
            "poll_interval": get_kb_workers_poll_time(),
            "total_jobs_processed": self._total_jobs_processed,
            "total_batches_processed": self._total_batches_processed,
            "last_processed_at": self._last_processed_at,
            "last_vault_sync_at": self._last_vault_sync_at if self._last_vault_sync_at > 0 else None,
        }


worker_manager = UserKnowledgeBaseWorkerManager()


async def start_user_knowledge_base() -> bool:
    return await worker_manager.start()


async def stop_user_knowledge_base() -> None:
    await worker_manager.stop()


def get_user_knowledge_base_status() -> Dict[str, Any]:
    return worker_manager.get_status()


async def sync_user_knowledge_base_from_vault(
    user_override: Optional[Dict[str, Any]] = None,
) -> bool:
    return await worker_manager.sync_vault_user_profile(user_override)
