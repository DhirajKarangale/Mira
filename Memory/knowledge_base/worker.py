from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from .config import (
    DEFAULT_BATCH_SIZE,
    get_worker_concurrency,
    get_worker_poll_time,
)
from .broker_client import (
    poll_embedding_jobs,
    remove_embedding_job,
)
from .qdrant_store import QdrantVectorStore
from .storage import kb_storage

try:
    from vault_logger import log
except ImportError:
    try:
        from Memory.vault_logger import log
    except ImportError:
        def log(msg: str): logging.getLogger("mira.memory.kb.worker").info(msg)

logger = logging.getLogger("mira.memory.knowledge_base.worker")

def process_kb_batch(
    jobs: List[Dict[str, Any]],
    worker_id: int = 1,
    vector_store: Optional[QdrantVectorStore] = None
) -> bool:
    """Processes a batch of jobs by ingesting into Qdrant and acknowledging on success.
    
    If ingestion fails, input jobs are NOT removed from the stream to prevent data loss.
    """
    if not jobs:
        return True

    store = vector_store or QdrantVectorStore()
    job_ids = [str(j.get("job_id")) for j in jobs if j.get("job_id")]

    try:
        # Batch ingestion into monthly Qdrant vector store with Vault encryption
        store.ingest_batch(jobs)

        # Acknowledge and remove jobs from stream ONLY AFTER successful storage
        removed_count = 0
        for jid in job_ids:
            if remove_embedding_job(jid):
                removed_count += 1

        log(
            f"[KBWorker-{worker_id}] Successfully ingested batch of {len(jobs)} jobs into Qdrant "
            f"knowledge base and acknowledged {removed_count}/{len(job_ids)} jobs from Message Broker."
        )
        return True

    except Exception as e:
        log(
            f"[KBWorker-{worker_id}] Error during batch ingestion into Qdrant: {e}. "
            f"Retaining {len(jobs)} jobs in Message Broker for retry without data loss."
        )
        return False

class KnowledgeBaseWorkerManager:
    """Manages parallel background workers polling and ingesting jobs into Qdrant knowledge bases."""

    def __init__(self, batch_size: int = DEFAULT_BATCH_SIZE) -> None:
        self.is_running: bool = False
        self._stop_event: asyncio.Event = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._worker_count: int = 1
        self._poll_time: float = 1.0
        self.batch_size: int = batch_size
        self._total_jobs_processed: int = 0
        self.vector_store: QdrantVectorStore = QdrantVectorStore()

    def refresh_config(self) -> None:
        """Dynamically refreshes worker count and poll time from Vault."""
        try:
            self._worker_count = get_worker_concurrency()
            self._poll_time = get_worker_poll_time()
        except Exception as e:
            logger.debug(f"Could not refresh worker config from Vault: {e}")

    async def _worker_loop(self, worker_id: int) -> None:
        consumer_name = f"kb_worker_{worker_id}"
        log(f"[KBWorker-{worker_id}] Worker online (poll_time={self._poll_time}s, batch_size={self.batch_size})")

        while not self._stop_event.is_set():
            try:
                self.refresh_config()

                # Poll up to batch_size jobs via Message Broker API
                jobs = await asyncio.to_thread(
                    poll_embedding_jobs,
                    self.batch_size,
                    consumer_name
                )

                if jobs and len(jobs) > 0:
                    log(f"[KBWorker-{worker_id}] Retrieved batch of {len(jobs)} jobs from Message Broker.")
                    success = await asyncio.to_thread(
                        process_kb_batch,
                        jobs,
                        worker_id,
                        self.vector_store
                    )
                    if success:
                        self._total_jobs_processed += len(jobs)
                        # Yield briefly before polling immediately to drain backlog
                        await asyncio.sleep(0.01)
                    else:
                        # Wait poll interval on error before retrying
                        await asyncio.sleep(self._poll_time)
                else:
                    # Idle: wait for poll interval or stop signal
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                    except asyncio.TimeoutError:
                        pass

            except asyncio.CancelledError:
                break
            except Exception as e:
                log(f"[KBWorker-{worker_id}] Unhandled error in worker loop: {e}")
                await asyncio.sleep(self._poll_time)

        log(f"[KBWorker-{worker_id}] Worker stopped cleanly")

    async def start(self) -> None:
        """Starts embedding_vector_store_workers parallel background workers."""
        if self.is_running:
            return

        self.refresh_config()
        self.is_running = True
        self._stop_event.clear()

        log(f"Starting {self._worker_count} Knowledge Base vector store worker(s) in parallel (poll_time: {self._poll_time}s)...")
        for i in range(1, self._worker_count + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

    async def stop(self) -> None:
        """Gracefully terminates all knowledge base workers and flushes vector store."""
        if not self.is_running:
            return

        log("Stopping Knowledge Base vector store workers...")
        self.is_running = False
        self._stop_event.set()

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
                    if not t.done() and not t.get_loop().is_closed() and t.get_loop() == current_loop
                ]
                if active_tasks:
                    await asyncio.gather(*active_tasks, return_exceptions=True)
            except Exception:
                pass
            self._tasks.clear()

        self.vector_store.close()
        log("All Knowledge Base vector store workers stopped cleanly.")


    def get_status(self) -> Dict[str, Any]:
        kb_name, kb_path = kb_storage.get_active_knowledge_base()
        return {
            "is_running": self.is_running,
            "worker_count": self._worker_count,
            "active_tasks": len([t for t in self._tasks if not t.done()]),
            "poll_time": self._poll_time,
            "batch_size": self.batch_size,
            "total_jobs_processed": self._total_jobs_processed,
            "active_knowledge_base": kb_name,
            "active_kb_path": str(kb_path.resolve()),
            "total_points_in_active_kb": self.vector_store.get_count(),
        }

kb_worker_manager = KnowledgeBaseWorkerManager()

async def run_standalone() -> None:
    print("Starting MIRA Knowledge Base Vector Store Workers (Standalone)...")
    await kb_worker_manager.start()
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        await kb_worker_manager.stop()

if __name__ == "__main__":
    asyncio.run(run_standalone())
