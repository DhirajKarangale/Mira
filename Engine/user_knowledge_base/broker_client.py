from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests

from .config import CONSUMER_KEY_USER_KB, DEFAULT_BATCH_SIZE, get_broker_base_url, get_vault_base_url
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.user_knowledge_base.broker")


def poll_jobs(count: int = DEFAULT_BATCH_SIZE) -> List[Dict[str, Any]]:
    """
    Poll up to `count` jobs from the Message Broker for the user_knowledge_base consumer key.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    fetch_count = min(max(int(count), 1), 10)
    params = {"consumer_key": CONSUMER_KEY_USER_KB, "count": fetch_count}
    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                formatted_jobs: List[Dict[str, Any]] = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
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
        log_error(f"Polling '{CONSUMER_KEY_USER_KB}' returned status {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        log_error(f"Failed to poll '{CONSUMER_KEY_USER_KB}' from Message Broker: {e}")
        return []


def remove_job(job_id: str) -> bool:
    """
    Acknowledge and remove a processed job from the Message Broker Redis stream.
    """
    if not job_id:
        return False
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {"consumer_key": CONSUMER_KEY_USER_KB, "job_id": str(job_id)}
    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        if resp.status_code in (200, 204):
            return True
        log_error(f"Removing job {job_id} from '{CONSUMER_KEY_USER_KB}' returned status {resp.status_code}")
        return False
    except Exception as e:
        log_error(f"Failed to delete job {job_id} from Message Broker: {e}")
        return False


def remove_jobs_batch(job_ids: List[str]) -> Dict[str, bool]:
    """
    Acknowledge and delete multiple processed jobs from the Message Broker.
    """
    results: Dict[str, bool] = {}
    for jid in job_ids:
        if jid:
            results[jid] = remove_job(jid)
    return results


def fetch_user_from_vault() -> Optional[Dict[str, Any]]:
    """
    Retrieve current user details from Vault's /user endpoint.
    Falls back to direct config_storage inspection if HTTP request fails.
    """
    vault_base = get_vault_base_url()
    if vault_base:
        try:
            resp = requests.get(f"{vault_base}/user", timeout=2.0)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    has_data = any(
                        v is not None and str(v).strip() != ""
                        for k, v in data.items()
                        if k not in ("id", "exists")
                    )
                    if has_data:
                        return data
        except Exception as e:
            logger.debug(f"HTTP call to Vault /user failed: {e}")

    # Fallback: direct Vault config_storage access
    try:
        import sys
        vault_dir = Path(__file__).resolve().parent.parent.parent / "Vault"
        if str(vault_dir) not in sys.path:
            sys.path.insert(0, str(vault_dir))
        import config_storage
        config_storage.init_config_storage()
        cfg = config_storage.get_configuration("user_details")
        if isinstance(cfg, dict):
            return cfg
    except Exception as e:
        logger.debug(f"Direct Vault config_storage fallback failed: {e}")

    return None
