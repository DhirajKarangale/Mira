from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
import requests

from .config import get_vault_base_url
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.vault_client")


def _get_direct_storage():
    import sys
    from pathlib import Path
    vault_dir = Path(__file__).resolve().parent.parent.parent / "Vault"
    if str(vault_dir) not in sys.path:
        sys.path.append(str(vault_dir))
    import config_storage
    config_storage.init_config_storage()
    return config_storage


def fetch_today_daily_suggestions(user_date_str: Optional[str] = None) -> Optional[Dict[str, Any]]:
    vault_base = get_vault_base_url()
    try:
        params = {"date_str": user_date_str} if user_date_str else {}
        resp = requests.get(f"{vault_base}/daily_suggestions/today", params=params, timeout=3.0)
        if resp.status_code == 200:
            data = resp.json()
            if data and data.get("id"):
                return data
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API fetch today failed, trying direct storage: {e}")

    try:
        cs = _get_direct_storage()
        return cs.find_daily_suggestions_entry_for_today(date_str=user_date_str)
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage fetch today failed: {e}")
        return None


def fetch_latest_daily_suggestions() -> Optional[Dict[str, Any]]:
    vault_base = get_vault_base_url()
    try:
        resp = requests.get(f"{vault_base}/daily_suggestions/latest", timeout=3.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API fetch failed, trying direct storage: {e}")

    try:
        cs = _get_direct_storage()
        return cs.get_latest_daily_suggestions()
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage fetch failed: {e}")
        return None


def fetch_previous_daily_suggestions(skip_today: bool = True) -> Optional[Dict[str, Any]]:
    vault_base = get_vault_base_url()
    try:
        resp = requests.get(
            f"{vault_base}/daily_suggestions/previous",
            params={"skip_today": str(skip_today).lower()},
            timeout=3.0,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API fetch previous failed: {e}")

    try:
        cs = _get_direct_storage()
        return cs.get_previous_daily_suggestions(skip_today=skip_today)
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage previous fetch failed: {e}")
        return None


def fetch_daily_suggestions_history(days: int = 14) -> List[Dict[str, Any]]:
    vault_base = get_vault_base_url()
    try:
        resp = requests.get(
            f"{vault_base}/daily_suggestions/history",
            params={"days": days},
            timeout=3.0,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API fetch history failed: {e}")

    try:
        cs = _get_direct_storage()
        return cs.get_daily_suggestions_history(days=days)
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage history fetch failed: {e}")
        return []


def save_daily_suggestions_data(updates: Dict[str, Any], record_id: Optional[int] = None) -> Dict[str, Any]:
    vault_base = get_vault_base_url()
    payload = dict(updates)
    if record_id is not None:
        payload["record_id"] = record_id

    try:
        resp = requests.post(f"{vault_base}/daily_suggestions", json=payload, timeout=4.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API save failed, trying direct storage: {e}")

    try:
        cs = _get_direct_storage()
        return cs.save_daily_suggestions(updates, record_id=record_id)
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage save failed: {e}")
        return {}


def save_suggestion_completion(index: int, completed: bool, record_id: Optional[int] = None) -> Dict[str, Any]:
    vault_base = get_vault_base_url()
    payload = {
        "index": index,
        "completed": completed,
    }
    if record_id is not None:
        payload["record_id"] = record_id

    try:
        resp = requests.post(f"{vault_base}/daily_suggestions/completed", json=payload, timeout=3.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.debug(f"[DailySuggestions] Vault API completion save failed, trying direct storage: {e}")

    try:
        cs = _get_direct_storage()
        return cs.update_suggestion_completion(index=index, completed=completed, record_id=record_id)
    except Exception as e:
        log_error(f"[DailySuggestions] Direct storage completion save failed: {e}")
        return {"status": "error", "message": str(e)}
