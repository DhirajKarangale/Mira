from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from .config import (
    DEFAULT_BATCH_SIZE,
    get_embedding_workers_count,
    get_embedding_poll_time,
    get_embedding_model_name,
)
from .model import ensure_model_ready, is_model_ready
from .broker_client import poll_jobs
from .embedder import process_batch_jobs
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.embedding.worker")

class EmbeddingWorkerManager:
    """Manages parallel background workers polling and processing summary embedding jobs."""

    def __init__(self):
        self._running: bool = False
        self._tasks: List[asyncio.Task] = []
        self.batch_size: int = DEFAULT_BATCH_SIZE
        self._total_jobs_processed: int = 0

    def is_running(self) -> bool:
        return self._running

    async def start(self) -> bool:
        """Initializes model and starts parallel embedding workers according to Vault configuration."""
        if self._running:
            return True

        # 1. Ensure SentenceTransformers model is downloaded, cached, and ready before polling
        log("[Embedding Module] Ensuring embedding model is ready before starting workers...")
        ready = await asyncio.to_thread(ensure_model_ready)
        if not ready:
            log_error("[Embedding Module] Failed to verify embedding model readiness. Startup aborted.")
            return False

        self._running = True
        num_workers = get_embedding_workers_count()
        poll_interval = get_embedding_poll_time()
        model_name = get_embedding_model_name()

        log(f"Starting {num_workers} Embedding workers (model='{model_name}', batch_size={self.batch_size}, poll={poll_interval}s)...")

        self._tasks = []
        for i in range(1, num_workers + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

        return True

    async def stop(self) -> None:
        """Gracefully terminates all embedding workers."""
        if not self._running:
            return

        log("Stopping Embedding workers...")
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
                    if not t.done() and not t.get_loop().is_closed() and t.get_loop() == current_loop
                ]
                if active_tasks:
                    await asyncio.gather(*active_tasks, return_exceptions=True)
            except Exception:
                pass
            self._tasks = []

        log("All Embedding workers stopped.")

    async def _worker_loop(self, worker_id: int) -> None:
        """Independent non-blocking polling and batch embedding loop for a single worker."""
        log(f"[EmbeddingWorker-{worker_id}] Worker online and listening for summary jobs...")

        while self._running:
            try:
                poll_interval = get_embedding_poll_time()
                # Poll Message Broker for up to batch_size jobs without blocking event loop
                jobs = await asyncio.to_thread(poll_jobs, self.batch_size)

                if not jobs:
                    await asyncio.sleep(poll_interval)
                    continue

                log(f"[EmbeddingWorker-{worker_id}] Retrieved {len(jobs)} jobs from summary_embedding stream.")

                # Process batch in worker thread so embedding vector computation does not block event loop
                success = await asyncio.to_thread(process_batch_jobs, jobs, worker_id)
                if success:
                    self._total_jobs_processed += len(jobs)
                    # Yield briefly before polling again to drain queue quickly
                    await asyncio.sleep(0.05)
                else:
                    # On failure, wait briefly before retrying
                    await asyncio.sleep(2.0)

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[EmbeddingWorker-{worker_id}] Error in worker loop: {e}")
                await asyncio.sleep(2.0)

        log(f"[EmbeddingWorker-{worker_id}] Worker loop exited.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "num_workers": len(self._tasks) if self._running else 0,
            "configured_workers": get_embedding_workers_count(),
            "batch_size": self.batch_size,
            "poll_interval": get_embedding_poll_time(),
            "model_name": get_embedding_model_name(),
            "model_ready": is_model_ready(),
            "total_jobs_processed": self._total_jobs_processed,
        }

# Singleton worker manager instance
worker_manager = EmbeddingWorkerManager()

async def start_embedding() -> bool:
    """Public startup function for the Embedding module."""
    return await worker_manager.start()

async def stop_embedding() -> None:
    """Public shutdown function for the Embedding module."""
    await worker_manager.stop()

def get_embedding_status() -> Dict[str, Any]:
    return worker_manager.get_status()
