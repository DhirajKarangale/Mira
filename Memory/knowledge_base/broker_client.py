from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple
import requests

from .config import (
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    get_broker_base_url,
)

# Use centralized Vault logger
try:
    from vault_logger import log, log_error
except ImportError:
    try:
        from Memory.vault_logger import log, log_error
    except ImportError:
        def log(msg: str): logging.getLogger("mira.memory.kb").info(msg)
        def log_error(msg: str): logging.getLogger("mira.memory.kb").error(msg)

logger = logging.getLogger("mira.memory.knowledge_base.broker")

def poll_embedding_jobs(
    count: int = DEFAULT_BATCH_SIZE,
    consumer_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Polls up to `count` jobs from CONSUMER_GROUP_EMBEDDING_MEMORY via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    batch_count = min(max(int(count), 1), MAX_BATCH_SIZE)

    params: Dict[str, Any] = {
        "consumer_key": CONSUMER_KEY_EMBEDDING_MEMORY,
        "count": batch_count,
    }
    if consumer_name:
        params["consumer_name"] = consumer_name

    try:
        resp = requests.get(endpoint, params=params, timeout=6.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                formatted_jobs: List[Dict[str, Any]] = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    parsed_job = dict(item)
                    # Parse inner JSON strings if any were serialized as strings
                    for k, v in list(parsed_job.items()):
                        if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                            try:
                                parsed_job[k] = json.loads(v)
                            except Exception:
                                pass
                    formatted_jobs.append(parsed_job)
                return formatted_jobs
            return []
        log(f"Polling '{CONSUMER_KEY_EMBEDDING_MEMORY}' returned status {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        log(f"Failed to poll '{CONSUMER_KEY_EMBEDDING_MEMORY}' from Message Broker: {e}")
        return []

def remove_embedding_job(job_id: str) -> bool:
    """Acknowledges and removes a processed job from CONSUMER_GROUP_EMBEDDING_MEMORY."""
    if not job_id:
        return False

    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {
        "consumer_key": CONSUMER_KEY_EMBEDDING_MEMORY,
        "job_id": str(job_id),
    }

    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        if resp.status_code in (200, 204):
            return True
        log(f"Removing job {job_id} from '{CONSUMER_KEY_EMBEDDING_MEMORY}' returned status {resp.status_code}")
        return False
    except Exception as e:
        log(f"Failed to delete job {job_id} from Message Broker: {e}")
        return False

def remove_batch_jobs(job_ids: List[str]) -> Tuple[int, int]:
    """Acknowledges and removes multiple jobs after successful batch ingestion."""
    succeeded = 0
    failed = 0
    for jid in job_ids:
        if remove_embedding_job(jid):
            succeeded += 1
        else:
            failed += 1
    return succeeded, failed
