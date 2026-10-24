from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .config import MAX_SHORT_TERM_MEMORY
from .broker_client import store_chat_memory_broker, get_chat_memory_broker
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.memory")

# Local in-memory fallback cache in case Message Broker is temporarily unreachable
_LOCAL_MEMORY_CACHE: Dict[str, List[Dict[str, str]]] = {}


def store_session_memory(session_id: str, user_query: str, ai_response: str) -> bool:
    """
    Accepts session_id, user_query, and ai_response, then stores the conversation
    turn in Redis under that session ID via Message Broker.
    Keeps only the latest MAX_SHORT_TERM_MEMORY chats per session.
    Automatically removes older chats when the limit is exceeded.
    """
    clean_sid = str(session_id).strip()
    u_query = str(user_query).strip()
    a_reply = str(ai_response).strip()
    if not clean_sid or not u_query:
        return False

    # 1. Update local cache
    if clean_sid not in _LOCAL_MEMORY_CACHE:
        _LOCAL_MEMORY_CACHE[clean_sid] = []
    _LOCAL_MEMORY_CACHE[clean_sid].append({"user": u_query, "ai": a_reply})
    if len(_LOCAL_MEMORY_CACHE[clean_sid]) > MAX_SHORT_TERM_MEMORY:
        _LOCAL_MEMORY_CACHE[clean_sid] = _LOCAL_MEMORY_CACHE[clean_sid][-MAX_SHORT_TERM_MEMORY:]

    # 2. Persist to Redis through Message Broker
    try:
        success = store_chat_memory_broker(
            session_id=clean_sid,
            user_query=u_query,
            ai_response=a_reply,
            max_limit=MAX_SHORT_TERM_MEMORY,
        )
        if success:
            log(f"[ShortTermMemory] Saved chat exchange for session {clean_sid} (limit={MAX_SHORT_TERM_MEMORY})")
            return True
    except Exception as e:
        log_error(f"[ShortTermMemory] Error saving turn to Redis: {e}")

    return False


def get_session_memory(session_id: str) -> List[Dict[str, str]]:
    """
    Accepts session_id and returns its chat history if available from Redis
    via Message Broker (with local fallback).
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return []

    try:
        remote_history = get_chat_memory_broker(clean_sid, limit=MAX_SHORT_TERM_MEMORY)
        if remote_history:
            formatted: List[Dict[str, str]] = []
            for item in remote_history:
                u = item.get("user") or item.get("u") or ""
                a = item.get("ai") or item.get("a") or ""
                if u or a:
                    formatted.append({"user": str(u), "ai": str(a)})
            if formatted:
                _LOCAL_MEMORY_CACHE[clean_sid] = formatted[-MAX_SHORT_TERM_MEMORY:]
                return formatted[-MAX_SHORT_TERM_MEMORY:]
    except Exception as e:
        log_error(f"[ShortTermMemory] Error retrieving turn from Redis: {e}")

    # Fallback to local memory cache if Redis had an issue or no records
    return _LOCAL_MEMORY_CACHE.get(clean_sid, [])[-MAX_SHORT_TERM_MEMORY:]


def format_chat_history_for_llm(history: List[Dict[str, str]], current_query: str) -> str:
    """
    Formats the session chat history in a compact, token-efficient format
    for calling the LLM.
    """
    trimmed_query = current_query.strip()
    if not history:
        return trimmed_query

    lines: List[str] = ["Here is the recent dialogue history:"]
    for turn in history:
        u = turn.get("user", "").strip()
        a = turn.get("ai", "").strip()
        if u:
            lines.append(f"User: {u}")
        if a:
            lines.append(f"MIRA: {a}")

    lines.append("")
    lines.append(f"User: {trimmed_query}")
    lines.append("MIRA:")
    return "\n".join(lines)
