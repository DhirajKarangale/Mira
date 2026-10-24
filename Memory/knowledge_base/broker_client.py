from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from vault_logger import log, log_error
from .config import (
    DEFAULT_KB_BATCH_SIZE,
    MAX_KB_BATCH_SIZE,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    get_broker_base_url,
)

logger = logging.getLogger("mira.memory.knowledge_base.broker")

def poll_jobs(count: int = DEFAULT_KB_BATCH_SIZE) -> List[Dict[str, Any]]:
    """Polls up to `count` jobs from the embedding_memory stream via Message Broker.

    Supports up to 10 jobs per poll using a configurable batch-size constant.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    fetch_count = min(max(int(count), 1), MAX_KB_BATCH_SIZE)
    params = {
        "consumer_key": CONSUMER_KEY_EMBEDDING_MEMORY,
        "count": fetch_count,
    }

    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                formatted_jobs: List[Dict[str, Any]] = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    # Parse inner stringified fields if present
                    parsed_job = dict(item)
                    for k, v in list(parsed_job.items()):
                        if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                            try:
                                parsed_job[k] = json.loads(v)
                            except Exception:
                                pass
                    formatted_jobs.append(parsed_job)
                return formatted_jobs
            return []
        log_error(f"Polling '{CONSUMER_KEY_EMBEDDING_MEMORY}' returned status {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        log_error(f"Failed to poll '{CONSUMER_KEY_EMBEDDING_MEMORY}' from Message Broker: {e}")
        return []

def remove_job(job_id: str) -> bool:
    """Acknowledges and removes a processed job from the embedding_memory Redis stream consumer group."""
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
        log_error(f"Removing job {job_id} from '{CONSUMER_KEY_EMBEDDING_MEMORY}' returned status {resp.status_code}")
        return False
    except Exception as e:
        log_error(f"Failed to delete job {job_id} from Message Broker: {e}")
        return False

def acknowledge_batch(job_ids: List[str]) -> int:
    """Acknowledges and removes a list of successfully ingested jobs from Message Broker."""
    if not job_ids:
        return 0

    acked = 0
    for jid in job_ids:
        if remove_job(jid):
            acked += 1
    return acked
