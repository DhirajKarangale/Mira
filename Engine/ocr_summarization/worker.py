from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from .config import (
    DEFAULT_BATCH_SIZE,
    get_summarization_workers_count,
    get_summarization_poll_time,
)
from .broker_client import poll_jobs, publish_summary_job, remove_input_job
from .summarizer import summarize_batch
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.ocr_summarization.worker")

def process_batch_jobs(jobs: List[Dict[str, Any]], worker_id: int = 1) -> bool:
    """Processes a batch of OCR extraction jobs into summaries and publishes them."""
    if not jobs:
        return True

    log(f"[SummarizationWorker-{worker_id}] Processing batch of {len(jobs)} jobs...")
    start_time = time.time()

    # 1. Execute LLM batch summarization
    output_jobs = summarize_batch(jobs)
    if output_jobs is None:
        log_error(f"[SummarizationWorker-{worker_id}] Batch summarization failed due to LLM error. Retaining {len(jobs)} jobs for retry.")
        return False

    # 2. Publish output jobs and acknowledge input jobs
    success_count = 0
    fail_count = 0

    for idx, input_job in enumerate(jobs):
        output_job = output_jobs[idx]
        input_job_id = input_job.get("job_id")
        out_job_id = output_job.get("job_id")

        # Publish to CONSUMER_GROUP_SUMMARY_EMBEDDING
        published = publish_summary_job(output_job)
        if published:
            # Acknowledge and remove from CONSUMER_GROUP_OCR_TEXT_SUMMARIZATION
            if input_job_id:
                removed = remove_input_job(input_job_id)
                if not removed:
                    log_error(f"[SummarizationWorker-{worker_id}] Warning: output published but failed to acknowledge input {input_job_id}")
            success_count += 1
        else:
            log_error(f"[SummarizationWorker-{worker_id}] Failed to publish summary for input job {input_job_id}. Preserving input job.")
            fail_count += 1

    elapsed = time.time() - start_time
    log(
        f"[SummarizationWorker-{worker_id}] Batch complete in {elapsed:.2f}s "
        f"({success_count} succeeded, {fail_count} failed out of {len(jobs)})"
    )
    return fail_count == 0

class SummarizationWorkerManager:
    """Manages parallel background workers polling and processing OCR summarization jobs."""

    def __init__(self):
        self._running: bool = False
        self._tasks: List[asyncio.Task] = []
        self.batch_size: int = DEFAULT_BATCH_SIZE
        self._total_jobs_processed: int = 0

    def is_running(self) -> bool:
        return self._running

    async def start(self) -> bool:
        """Starts parallel summarization workers according to Vault configuration."""
        if self._running:
            return True

        self._running = True
        num_workers = get_summarization_workers_count()
        poll_interval = get_summarization_poll_time()

        log(f"Starting {num_workers} OCR Summarization workers (batch_size={self.batch_size}, poll={poll_interval}s)...")

        self._tasks = []
        for i in range(1, num_workers + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

        return True

    async def stop(self) -> None:
        """Gracefully terminates all summarization workers."""
        if not self._running:
            return

        log("Stopping OCR Summarization workers...")
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

        log("All OCR Summarization workers stopped.")

    async def _worker_loop(self, worker_id: int) -> None:
        """Independent non-blocking polling and batch processing loop for a single worker."""
        log(f"[SummarizationWorker-{worker_id}] Worker online and listening for jobs...")

        while self._running:
            try:
                poll_interval = get_summarization_poll_time()
                # Poll Message Broker for up to batch_size jobs without blocking event loop
                jobs = await asyncio.to_thread(poll_jobs, self.batch_size)

                if not jobs:
                    await asyncio.sleep(poll_interval)
                    continue

                log(f"[SummarizationWorker-{worker_id}] Retrieved {len(jobs)} jobs from stream.")

                # Process batch in a worker thread to ensure LLM execution does not block other workers
                success = await asyncio.to_thread(process_batch_jobs, jobs, worker_id)
                if success:
                    self._total_jobs_processed += len(jobs)
                    # Yield briefly before polling again immediately to drain backlog
                    await asyncio.sleep(0.05)
                else:
                    # If batch encountered a failure, wait briefly before retrying
                    await asyncio.sleep(2.0)

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[SummarizationWorker-{worker_id}] Error in worker loop: {e}")
                await asyncio.sleep(2.0)

        log(f"[SummarizationWorker-{worker_id}] Worker loop exited.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "num_workers": len(self._tasks) if self._running else 0,
            "configured_workers": get_summarization_workers_count(),
            "batch_size": self.batch_size,
            "poll_interval": get_summarization_poll_time(),
            "total_jobs_processed": self._total_jobs_processed,
        }

# Singleton worker manager instance
worker_manager = SummarizationWorkerManager()

async def start_ocr_summarization() -> bool:
    """Public startup function for the OCR summarization module."""
    return await worker_manager.start()

async def stop_ocr_summarization() -> None:
    """Public shutdown function for the OCR summarization module."""
    await worker_manager.stop()

def get_summarization_status() -> Dict[str, Any]:
    return worker_manager.get_status()
