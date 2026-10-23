"""Embedding Module for MIRA Engine."""
from __future__ import annotations

from .worker import (
    start_embedding,
    stop_embedding,
    get_embedding_status,
    worker_manager,
)
from .embedder import process_batch_jobs, process_single_job, create_output_job
from .model import (
    generate_embedding,
    generate_embeddings_batch,
    ensure_model_ready,
    is_model_ready,
    get_model,
)
from .config import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_MODEL_NAME,
    CONSUMER_KEY_SUMMARY_EMBEDDING,
    CONSUMER_GROUP_SUMMARY_EMBEDDING,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
)

__all__ = [
    "start_embedding",
    "stop_embedding",
    "get_embedding_status",
    "worker_manager",
    "process_batch_jobs",
    "process_single_job",
    "create_output_job",
    "generate_embedding",
    "generate_embeddings_batch",
    "ensure_model_ready",
    "is_model_ready",
    "get_model",
    "DEFAULT_BATCH_SIZE",
    "DEFAULT_MODEL_NAME",
    "CONSUMER_KEY_SUMMARY_EMBEDDING",
    "CONSUMER_GROUP_SUMMARY_EMBEDDING",
    "CONSUMER_KEY_EMBEDDING_MEMORY",
    "CONSUMER_GROUP_EMBEDDING_MEMORY",
]
