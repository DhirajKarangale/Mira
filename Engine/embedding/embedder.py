from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional
import uuid

from .model import generate_embedding, generate_embeddings_batch
from .broker_client import publish_embedding_job, remove_input_job
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.embedding.embedder")

def create_output_job(input_job: Dict[str, Any], embedding: List[float]) -> Dict[str, Any]:
    """Constructs the output embedding object with a newly generated UUID and original metadata."""
    return {
        "job_id": str(uuid.uuid4()),
        "app_name": str(input_job.get("app_name") or "Unknown").strip(),
        "os": str(input_job.get("os") or "Unknown").strip(),
        "timestamp": input_job.get("timestamp") or int(time.time()),
        "summarized_text": str(input_job.get("summarized_text") or "").strip(),
        "embedding": embedding,
    }

def process_single_job(input_job: Dict[str, Any]) -> bool:
    """Processes a single summarized job: generates embedding, publishes to memory, and acks input job."""
    input_job_id = input_job.get("job_id")
    summarized_text = input_job.get("summarized_text", "")

    try:
        embedding = generate_embedding(summarized_text)
        output_job = create_output_job(input_job, embedding)

        published = publish_embedding_job(output_job)
        if published:
            if input_job_id:
                removed = remove_input_job(input_job_id)
                if not removed:
                    log_error(f"[Embedding Embedder] Warning: output published but failed to acknowledge input {input_job_id}")
            return True
        else:
            log_error(f"[Embedding Embedder] Failed to publish embedding for job {input_job_id}. Preserving job.")
            return False
    except Exception as e:
        log_error(f"[Embedding Embedder] Error processing job {input_job_id}: {e}")
        return False

def process_batch_jobs(jobs: List[Dict[str, Any]], worker_id: int = 1) -> bool:
    """Processes a batch of summarized jobs using batch embedding inference for maximum throughput."""
    if not jobs:
        return True

    log(f"[EmbeddingWorker-{worker_id}] Processing batch of {len(jobs)} jobs...")
    start_time = time.time()

    try:
        # Extract texts for batch embedding
        texts = [str(j.get("summarized_text") or "").strip() for j in jobs]
        embeddings = generate_embeddings_batch(texts)

        if len(embeddings) != len(jobs):
            log_error(f"[EmbeddingWorker-{worker_id}] Embeddings count ({len(embeddings)}) mismatch with jobs ({len(jobs)})")
            return False

        success_count = 0
        fail_count = 0

        for idx, input_job in enumerate(jobs):
            input_job_id = input_job.get("job_id")
            emb = embeddings[idx]
            output_job = create_output_job(input_job, emb)

            # Publish to CONSUMER_GROUP_EMBEDDING_MEMORY
            published = publish_embedding_job(output_job)
            if published:
                # Acknowledge and remove from CONSUMER_GROUP_SUMMARY_EMBEDDING
                if input_job_id:
                    removed = remove_input_job(input_job_id)
                    if not removed:
                        log_error(f"[EmbeddingWorker-{worker_id}] Warning: output published but failed to ack {input_job_id}")
                success_count += 1
            else:
                log_error(f"[EmbeddingWorker-{worker_id}] Failed to publish embedding for input {input_job_id}. Preserving job.")
                fail_count += 1

        elapsed = time.time() - start_time
        log(
            f"[EmbeddingWorker-{worker_id}] Batch complete in {elapsed:.2f}s "
            f"({success_count} succeeded, {fail_count} failed out of {len(jobs)})"
        )
        return fail_count == 0

    except Exception as e:
        log_error(f"[EmbeddingWorker-{worker_id}] Batch embedding processing encountered an error: {e}")
        return False
