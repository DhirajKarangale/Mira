from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
import requests

from .config import (
    CONSUMER_KEY_LLM_CHAT,
    MAX_SHORT_TERM_MEMORY,
    get_broker_base_url,
    get_vault_base_url,
)
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.broker")


def poll_chat_jobs(count: int = 1) -> List[Dict[str, Any]]:
    """
    Poll incoming chat jobs from Message Broker Redis stream for consumer group CONSUMER_GROUP_LLM_CHAT.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {
        "consumer_key": CONSUMER_KEY_LLM_CHAT,
        "count": min(max(int(count), 1), 10),
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
        log_error(f"Polling '{CONSUMER_KEY_LLM_CHAT}' returned status {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        log_error(f"Failed to poll '{CONSUMER_KEY_LLM_CHAT}' from Message Broker: {e}")
        return []


def publish_chat_job(
    job_id: str,
    session_id: str,
    user_query: str,
    extra_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Publish a new chat job to Message Broker Redis stream.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    payload: Dict[str, Any] = {
        "job_id": str(job_id),
        "session_id": str(session_id),
        "user_query": str(user_query),
        "consumer_key": CONSUMER_KEY_LLM_CHAT,
    }
    if extra_data:
        payload.update(extra_data)

    try:
        resp = requests.post(endpoint, json=payload, timeout=5.0)
        if resp.status_code in (200, 201):
            return True
        log_error(f"Publishing chat job {job_id} returned status {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log_error(f"Failed to publish chat job {job_id} to Message Broker: {e}")
        return False


def acknowledge_chat_job(job_id: str) -> bool:
    """
    Acknowledge and delete completed job from Message Broker stream.
    """
    if not job_id:
        return False
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {
        "consumer_key": CONSUMER_KEY_LLM_CHAT,
        "job_id": str(job_id),
    }

    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        if resp.status_code in (200, 204):
            return True
        log_error(f"Removing job {job_id} from '{CONSUMER_KEY_LLM_CHAT}' returned status {resp.status_code}")
        return False
    except Exception as e:
        log_error(f"Failed to delete job {job_id} from Message Broker: {e}")
        return False


def store_chat_memory_broker(
    session_id: str,
    user_query: str,
    ai_response: str,
    max_limit: int = MAX_SHORT_TERM_MEMORY,
) -> bool:
    """
    Store chat conversation turn in Redis via Message Broker's /chat/memory API.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/chat/memory"
    payload = {
        "session_id": str(session_id),
        "user_query": str(user_query),
        "ai_response": str(ai_response),
        "max_limit": max_limit,
    }

    try:
        resp = requests.post(endpoint, json=payload, timeout=5.0)
        if resp.status_code in (200, 201):
            return True
        log_error(f"Saving chat memory for session {session_id} returned status {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        log_error(f"Failed to store chat memory via Message Broker: {e}")
        return False


def get_chat_memory_broker(
    session_id: str,
    limit: int = MAX_SHORT_TERM_MEMORY,
) -> List[Dict[str, Any]]:
    """
    Retrieve session chat history from Redis via Message Broker's /chat/memory/{session_id} API.
    """
    base_url = get_broker_base_url()
    clean_sid = str(session_id).strip()
    endpoint = f"{base_url}/chat/memory/{clean_sid}"
    params = {"limit": limit}

    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
            return []
        log_error(f"Getting chat memory for session {clean_sid} returned status {resp.status_code}")
        return []
    except Exception as e:
        log_error(f"Failed to fetch chat memory via Message Broker: {e}")
        return []


def save_chat_to_vault(
    session_id: str,
    role: str,
    content: str,
    chat_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Persist chat message in Vault chats table.
    """
    vault_base = get_vault_base_url()
    endpoint = f"{vault_base}/chats"
    payload: Dict[str, Any] = {
        "session_id": str(session_id).strip(),
        "role": str(role).strip().lower(),
        "content": str(content).strip(),
    }
    if chat_name:
        payload["chat_name"] = str(chat_name).strip()

    try:
        resp = requests.post(endpoint, json=payload, timeout=5.0)
        if resp.status_code in (200, 201):
            return resp.json()
        log_error(f"Vault /chats returned {resp.status_code}: {resp.text}")
        return None
    except Exception as e:
        log_error(f"Failed to save message to Vault: {e}")
        return None


def fetch_session_messages_from_vault(
    session_id: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Retrieve entire chat history for a session from Vault's SQLite storage.
    Paginates if total_pages > 1 to retrieve the full chat history in chronological order.
    """
    vault_base = get_vault_base_url()
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return []

    all_messages: List[Dict[str, Any]] = []
    page = 1
    max_pages = 20

    while page <= max_pages:
        endpoint = f"{vault_base}/chats/sessions/{clean_sid}"
        params = {"limit": limit, "page": page}
        try:
            resp = requests.get(endpoint, params=params, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                msgs = data.get("messages", [])
                if not msgs:
                    break
                all_messages.extend(msgs)
                total_pages = data.get("total_pages", 1)
                if page >= total_pages:
                    break
                page += 1
            else:
                log_error(f"Failed to fetch session {clean_sid} messages from Vault: HTTP {resp.status_code}")
                break
        except Exception as e:
            log_error(f"Error fetching session {clean_sid} messages from Vault: {e}")
            break

    return all_messages


def delete_session_from_vault(session_id: str) -> bool:
    """
    Delete all messages for a session from Vault chats table.
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return False
    vault_base = get_vault_base_url()
    endpoint = f"{vault_base}/chats/sessions/{clean_sid}"
    try:
        resp = requests.delete(endpoint, timeout=5.0)
        return resp.status_code in (200, 204)
    except Exception as e:
        log_error(f"Failed to delete session {clean_sid} from Vault: {e}")
        return False


def delete_all_sessions_from_vault() -> bool:
    """
    Delete all chats from Vault chats table.
    """
    vault_base = get_vault_base_url()
    endpoint = f"{vault_base}/chats/all"
    try:
        resp = requests.delete(endpoint, timeout=5.0)
        return resp.status_code in (200, 204)
    except Exception as e:
        log_error(f"Failed to delete all chats from Vault: {e}")
        return False


def delete_chat_memory_broker(session_id: str) -> bool:
    """
    Delete short-term memory for a session from Redis via Message Broker.
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return False
    broker_base = get_broker_base_url()
    endpoint = f"{broker_base}/chat/memory/{clean_sid}"
    try:
        resp = requests.delete(endpoint, timeout=5.0)
        return resp.status_code in (200, 204)
    except Exception as e:
        log_error(f"Failed to delete chat memory for session {clean_sid}: {e}")
        return False


def delete_all_chat_memory_broker() -> bool:
    """
    Delete all chat short-term memories from Redis via Message Broker.
    """
    broker_base = get_broker_base_url()
    endpoint = f"{broker_base}/chat/memory"
    try:
        resp = requests.delete(endpoint, timeout=5.0)
        return resp.status_code in (200, 204)
    except Exception as e:
        log_error(f"Failed to delete all chat memory from Message Broker: {e}")
        return False

