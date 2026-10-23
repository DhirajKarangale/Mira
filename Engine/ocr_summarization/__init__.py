"""OCR Summarization Module for MIRA Engine."""
from __future__ import annotations

from .worker import (
    start_ocr_summarization,
    stop_ocr_summarization,
    get_summarization_status,
    worker_manager,
    process_single_job,
    process_batch_jobs,
)
from .summarizer import (
    summarize_job,
    summarize_single_job,
    summarize_batch,
    sanitize_job_input,
    build_single_prompt,
    build_batch_prompt,
)
from .config import (
    DEFAULT_BATCH_SIZE,
    CONSUMER_KEY_OCR_SUMMARIZATION,
    CONSUMER_GROUP_OCR_SUMMARIZATION,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
)

__all__ = [
    "start_ocr_summarization",
    "stop_ocr_summarization",
    "get_summarization_status",
    "worker_manager",
    "process_single_job",
    "process_batch_jobs",
    "summarize_job",
    "summarize_single_job",
    "summarize_batch",
    "sanitize_job_input",
    "build_single_prompt",
    "build_batch_prompt",
    "DEFAULT_BATCH_SIZE",
    "CONSUMER_KEY_OCR_SUMMARIZATION",
    "CONSUMER_GROUP_OCR_SUMMARIZATION",
    "CONSUMER_KEY_EMBEDDING_MEMORY",
    "CONSUMER_GROUP_EMBEDDING_MEMORY",
]
