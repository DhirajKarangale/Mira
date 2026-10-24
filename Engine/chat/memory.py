from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .config import MAX_SHORT_TERM_MEMORY
from .broker_client import (
    store_chat_memory_broker,
    get_chat_memory_broker,
    fetch_session_messages_from_vault,
    delete_chat_memory_broker,
    delete_all_chat_memory_broker,
)
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


def get_entire_session_history(session_id: str) -> List[Dict[str, str]]:
    """
    Retrieves the entire conversation history for a session from Vault (SQLite store).
    Returns list of {'role': 'user'|'ai', 'content': '...'} in chronological order.
    Falls back to Redis short-term memory if Vault returns no records.
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return []

    try:
        vault_msgs = fetch_session_messages_from_vault(clean_sid, limit=100)
        if vault_msgs:
            history: List[Dict[str, str]] = []
            for m in vault_msgs:
                r = (m.get("role") or "").lower().strip()
                c = (m.get("content") or "").strip()
                if r in ("user", "ai") and c:
                    history.append({"role": r, "content": c})
            if history:
                return history
    except Exception as e:
        log_error(f"[ChatMemory] Error fetching full history from Vault for {clean_sid}: {e}")

    st_memory = get_session_memory(clean_sid)
    fallback: List[Dict[str, str]] = []
    for turn in st_memory:
        u = str(turn.get("user") or "").strip()
        a = str(turn.get("ai") or "").strip()
        if u:
            fallback.append({"role": "user", "content": u})
        if a:
            fallback.append({"role": "ai", "content": a})
    return fallback


def clear_session_memory(session_id: str) -> bool:
    """
    Removes session's short-term memory from Redis via Message Broker and clears local cache.
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return False
    _LOCAL_MEMORY_CACHE.pop(clean_sid, None)
    return delete_chat_memory_broker(clean_sid)


def clear_all_sessions_memory() -> bool:
    """
    Removes all sessions' short-term memory from Redis via Message Broker and clears local cache.
    """
    _LOCAL_MEMORY_CACHE.clear()
    return delete_all_chat_memory_broker()


def format_chat_history_for_llm(history: List[Dict[str, Any]], current_query: str) -> str:
    """
    Formats the session chat history in a clean, token-efficient format
    for calling the LLM. Ensures the entire conversation history is provided
    so the LLM has complete context, avoiding duplicate inclusion of the current query.
    """
    trimmed_query = current_query.strip()

    normalized: List[tuple[str, str]] = []
    for item in history:
        if "role" in item and "content" in item:
            r = str(item["role"]).lower().strip()
            c = str(item["content"]).strip()
            if r and c:
                normalized.append((r, c))
        elif "user" in item or "ai" in item:
            u = str(item.get("user", "")).strip()
            a = str(item.get("ai", "")).strip()
            if u:
                normalized.append(("user", u))
            if a:
                normalized.append(("ai", a))

    # If the last message in history is the pre-saved user query, exclude it from previous turns
    if normalized and normalized[-1][0] == "user" and normalized[-1][1] == trimmed_query:
        normalized.pop()

    if not normalized:
        return (
            "You are MIRA, an intelligent, helpful, and friendly AI assistant.\n\n"
            f"User: {trimmed_query}\n"
            "MIRA:"
        )

    lines: List[str] = [
        "You are MIRA, an intelligent, helpful, and friendly AI assistant.",
        "Here is the complete conversation history so far with the user:\n",
    ]
    for role, content in normalized:
        prefix = "User:" if role == "user" else "MIRA:"
        lines.append(f"{prefix} {content}")

    lines.append("")
    lines.append(f"User: {trimmed_query}")
    lines.append("MIRA:")
    return "\n".join(lines)

