from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import uuid
from .config import (
    DEFAULT_BATCH_SIZE,
    get_summarization_workers_count,
    get_summarization_poll_time,
)
from .broker_client import poll_jobs, publish_embedding_memory_job, publish_summary_job, remove_input_job
from .summarizer import summarize_job, summarize_single_job, summarize_batch
from embedding import get_embedding
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.ocr_summarization.worker")

def process_single_job(job: Dict[str, Any], worker_id: int = 1) -> bool:
    """Processes an individual OCR extraction job:
    1. Summarizes its extracted text using the LLM.
    2. Calls the embedding function with only the resulting summarized_text.
    3. Builds output object: job_id (new UUID), app_name, os, timestamp, summarized_text, embedding.
    4. Publishes to the 'embedding_memory' stream through Message Broker.
    5. Acknowledges and removes input job on success; retains job on failure.
    """
    input_job_id = job.get("job_id")
    if not input_job_id:
        log_error(f"[SummarizationWorker-{worker_id}] Job missing 'job_id', skipping.")
        return False

    # 1. Summarize extracted text individually
    summary_res = summarize_job(job)
    if summary_res is None:
        log_error(f"[SummarizationWorker-{worker_id}] Summarization failed for job {input_job_id}. Retaining job for retry.")
        return False

    app_name = summary_res.get("app_name", "Application")
    summarized_text = summary_res.get("summary", "")

    # 2. Call embedding function with only summarized_text
    try:
        embedding_vector = get_embedding(summarized_text)
    except Exception as e:
        log_error(f"[SummarizationWorker-{worker_id}] Embedding generation failed for job {input_job_id}: {e}. Retaining job for retry.")
        return False

    # 3. Create output object
    output_job = {
        "job_id": str(uuid.uuid4()),
        "app_name": app_name,
        "os": str(job.get("os") or "Unknown").strip(),
        "timestamp": job.get("timestamp") or int(time.time()),
        "summarized_text": summarized_text,
        "embedding": embedding_vector,
    }

    # 4. Publish to embedding_memory Redis stream through Message Broker
    published = publish_embedding_memory_job(output_job)
    if not published:
        log_error(f"[SummarizationWorker-{worker_id}] Failed to publish to 'embedding_memory' for job {input_job_id}. Preserving job for retry.")
        return False

    # 5. Acknowledge and remove input job from ocr_summarization
    removed = remove_input_job(input_job_id)
    if not removed:
        log_error(f"[SummarizationWorker-{worker_id}] Warning: output published but failed to acknowledge input {input_job_id}")

    return True

def process_batch_jobs(jobs: List[Dict[str, Any]], worker_id: int = 1) -> bool:
    """Processes a batch of OCR extraction jobs individually and publishes them to embedding_memory."""
    if not jobs:
        return True

    log(f"[SummarizationWorker-{worker_id}] Processing {len(jobs)} jobs individually...")
    start_time = time.time()

    success_count = 0
    fail_count = 0

    for job in jobs:
        success = process_single_job(job, worker_id=worker_id)
        if success:
            success_count += 1
        else:
            fail_count += 1

    elapsed = time.time() - start_time
    log(
        f"[SummarizationWorker-{worker_id}] Completed {len(jobs)} jobs in {elapsed:.2f}s "
        f"({success_count} succeeded, {fail_count} failed)"
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
