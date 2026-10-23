from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
import requests

from .config import (
    DEFAULT_BATCH_SIZE,
    CONSUMER_KEY_OCR_SUMMARIZATION,
    CONSUMER_KEY_SUMMARY_EMBEDDING,
    get_broker_base_url,
)
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.ocr_summarization.broker")

def poll_jobs(count: int = DEFAULT_BATCH_SIZE) -> List[Dict[str, Any]]:
    """Polls up to `count` jobs from the OCR summarization stream via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {
        "consumer_key": CONSUMER_KEY_OCR_SUMMARIZATION,
        "count": min(max(int(count), 1), 10),
    }

    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                # Ensure each job's inner data is parsed if nested
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
        log_error(f"Polling '{CONSUMER_KEY_OCR_SUMMARIZATION}' returned status {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        log_error(f"Failed to poll '{CONSUMER_KEY_OCR_SUMMARIZATION}' from Message Broker: {e}")
        return []

def publish_summary_job(output_job: Dict[str, Any]) -> bool:
    """Publishes a summarized output job to CONSUMER_GROUP_SUMMARY_EMBEDDING via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"

    payload = {
        **output_job,
        "consumer_key": CONSUMER_KEY_SUMMARY_EMBEDDING,
    }

    try:
        resp = requests.post(endpoint, json=payload, timeout=5.0)
        if resp.status_code in (200, 201):
            return True
        log_error(f"Publishing to '{CONSUMER_KEY_SUMMARY_EMBEDDING}' returned status {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log_error(f"Failed to publish output job {output_job.get('job_id')} to Message Broker: {e}")
        return False

def remove_input_job(job_id: str) -> bool:
    """Acknowledges and removes a processed job from CONSUMER_GROUP_OCR_TEXT_SUMMARIZATION."""
    if not job_id:
        return False

    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {
        "consumer_key": CONSUMER_KEY_OCR_SUMMARIZATION,
        "job_id": str(job_id),
    }

    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        if resp.status_code in (200, 204):
            return True
        log_error(f"Removing job {job_id} from '{CONSUMER_KEY_OCR_SUMMARIZATION}' returned status {resp.status_code}")
        return False
    except Exception as e:
        log_error(f"Failed to delete job {job_id} from Message Broker: {e}")
        return False
