from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from . import config as chat_config
from .config import (
    MAX_SHORT_TERM_MEMORY,
    MAX_SHORT_TERM_CHATS,
    MAX_SHORT_TERM_TOKENS,
    SHORT_TERM_MEMORY_STRATEGY,
    MEMORY_STRATEGY_COUNT,
    MEMORY_STRATEGY_TOKENS,
)
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
_TOKENIZER = None


def get_tokenizer():
    global _TOKENIZER
    if _TOKENIZER is None:
        try:
            import tiktoken
            _TOKENIZER = tiktoken.get_encoding("cl100k_base")
        except Exception as e:
            logger.debug(f"[ShortTermMemory] tiktoken unavailable: {e}")
            _TOKENIZER = False
    return _TOKENIZER


def get_active_strategy(strategy_override: Optional[str] = None) -> str:
    """
    Returns the effective short-term memory strategy ('count' or 'tokens').
    Respects runtime dynamic modifications to chat_config.SHORT_TERM_MEMORY_STRATEGY.
    """
    strat = strategy_override or getattr(chat_config, "SHORT_TERM_MEMORY_STRATEGY", MEMORY_STRATEGY_TOKENS)
    return str(strat).lower().strip()


def get_max_chats(limit_override: Optional[int] = None) -> int:
    """Returns the effective maximum chat count limit."""
    if limit_override is not None and limit_override > 0:
        return limit_override
    return int(getattr(chat_config, "MAX_SHORT_TERM_CHATS", MAX_SHORT_TERM_CHATS))


def get_max_tokens(limit_override: Optional[int] = None) -> int:
    """Returns the effective maximum token budget limit."""
    if limit_override is not None and limit_override > 0:
        return limit_override
    return int(getattr(chat_config, "MAX_SHORT_TERM_TOKENS", MAX_SHORT_TERM_TOKENS))


def estimate_tokens(text: str) -> int:
    """
    Computes accurate token count using tiktoken (cl100k_base),
    with a robust character/word heuristic fallback if tiktoken is offline.
    """
    if not text:
        return 0
    clean = str(text)
    tokenizer = get_tokenizer()
    if tokenizer:
        try:
            return len(tokenizer.encode(clean))
        except Exception:
            pass
    # Resilient heuristic fallback: ~3.7 chars per token
    return max(1, int(len(clean) / 3.7))


def count_turn_tokens(item: Dict[str, Any]) -> int:
    """
    Counts tokens for a single conversation turn or message item.
    Supports:
      - Turn dict: {"user": "...", "ai": "..."}
      - Message dict: {"role": "user"|"ai", "content": "..."}
    """
    if not item or not isinstance(item, dict):
        return 0
    if "role" in item and "content" in item:
        return estimate_tokens(str(item.get("content") or "")) + 4
    u = str(item.get("user") or item.get("u") or "")
    a = str(item.get("ai") or item.get("a") or "")
    tokens = 0
    if u:
        tokens += estimate_tokens(u) + 4
    if a:
        tokens += estimate_tokens(a) + 4
    return tokens


def count_history_tokens(history: List[Dict[str, Any]]) -> int:
    """
    Computes total token count across all turns/messages in history.
    """
    if not history:
        return 0
    return sum(count_turn_tokens(item) for item in history)


def trim_history_by_count(
    history: List[Dict[str, Any]],
    max_count: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Trims chat history to retain only the latest max_count chat turns.
    Older chats are removed when the count limit is reached.
    """
    if not history:
        return []
    limit = get_max_chats(max_count)
    if limit <= 0:
        return []
    # If history contains single messages (role + content), 1 turn = 2 messages
    if history and "role" in history[0] and "content" in history[0]:
        return history[-(limit * 2):]
    return history[-limit:]


def trim_history_by_tokens(
    history: List[Dict[str, Any]],
    max_tokens: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Trims chat history so total token count is within max_tokens.
    Preserves most recent chats and removes older chats (FIFO) when limit is reached.
    Always preserves at least the latest conversation turn if history is non-empty.
    """
    if not history:
        return []

    token_budget = get_max_tokens(max_tokens)
    accumulated_tokens = 0
    preserved: List[Dict[str, Any]] = []

    for item in reversed(history):
        t_tokens = count_turn_tokens(item)
        if (accumulated_tokens + t_tokens <= token_budget) or not preserved:
            preserved.append(item)
            accumulated_tokens += t_tokens
        else:
            # Token limit reached: older chats are evicted
            break

    preserved.reverse()
    return preserved


def trim_history(
    history: List[Dict[str, Any]],
    strategy: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Unified entry point to trim chat history according to the active strategy:
      - 'count': Bounded by MAX_SHORT_TERM_CHATS
      - 'tokens': Bounded by MAX_SHORT_TERM_TOKENS
    Controlled by SHORT_TERM_MEMORY_STRATEGY in config.py.
    """
    active_strat = get_active_strategy(strategy)
    if active_strat == MEMORY_STRATEGY_COUNT:
        return trim_history_by_count(history)
    return trim_history_by_tokens(history)


def store_session_memory(session_id: str, user_query: str, ai_response: str) -> bool:
    """
    Accepts session_id, user_query, and ai_response, then stores the conversation
    turn in Redis under that session ID via Message Broker and updates local cache.
    Applies the active short-term memory strategy (count or tokens):
      1) Count approach: Keeps only latest MAX_SHORT_TERM_CHATS chat turns.
      2) Token approach: Stores chat history until MAX_SHORT_TERM_TOKENS is reached;
         if reached, older chats are removed.
    """
    clean_sid = str(session_id).strip()
    u_query = str(user_query).strip()
    a_reply = str(ai_response).strip()
    if not clean_sid or not u_query:
        return False

    active_strat = get_active_strategy()

    # 1. Update local cache
    if clean_sid not in _LOCAL_MEMORY_CACHE:
        _LOCAL_MEMORY_CACHE[clean_sid] = []
    _LOCAL_MEMORY_CACHE[clean_sid].append({"user": u_query, "ai": a_reply})

    # Apply trimming according to active strategy
    _LOCAL_MEMORY_CACHE[clean_sid] = trim_history(_LOCAL_MEMORY_CACHE[clean_sid])

    current_turns = len(_LOCAL_MEMORY_CACHE[clean_sid])
    current_tokens = count_history_tokens(_LOCAL_MEMORY_CACHE[clean_sid])

    # 2. Persist to Redis through Message Broker
    try:
        redis_limit = (
            get_max_chats()
            if active_strat == MEMORY_STRATEGY_COUNT
            else min(50, max(current_turns, 20))
        )
        success = store_chat_memory_broker(
            session_id=clean_sid,
            user_query=u_query,
            ai_response=a_reply,
            max_limit=redis_limit,
        )
        if success:
            log(
                f"[ShortTermMemory] Saved chat exchange for session {clean_sid} "
                f"[Strategy={active_strat}, turns={current_turns}, tokens={current_tokens}]"
            )
            return True
    except Exception as e:
        log_error(f"[ShortTermMemory] Error saving turn to Redis: {e}")

    return False


def get_session_memory(session_id: str) -> List[Dict[str, str]]:
    """
    Accepts session_id and returns its short-term chat history from Redis
    via Message Broker (with local fallback), trimmed to the active strategy.
    """
    clean_sid = str(session_id).strip()
    if not clean_sid:
        return []

    active_strat = get_active_strategy()
    fetch_limit = 50 if active_strat == MEMORY_STRATEGY_TOKENS else min(50, get_max_chats())

    try:
        remote_history = get_chat_memory_broker(clean_sid, limit=fetch_limit)
        if remote_history:
            formatted: List[Dict[str, str]] = []
            for item in remote_history:
                u = item.get("user") or item.get("u") or ""
                a = item.get("ai") or item.get("a") or ""
                if u or a:
                    formatted.append({"user": str(u), "ai": str(a)})
            if formatted:
                trimmed = trim_history(formatted)
                _LOCAL_MEMORY_CACHE[clean_sid] = trimmed
                return trimmed
    except Exception as e:
        log_error(f"[ShortTermMemory] Error retrieving turn from Redis: {e}")

    # Fallback to local memory cache if Redis had an issue or no records
    cached = _LOCAL_MEMORY_CACHE.get(clean_sid, [])
    trimmed_cached = trim_history(cached)
    _LOCAL_MEMORY_CACHE[clean_sid] = trimmed_cached
    return trimmed_cached


def get_entire_session_history(session_id: str) -> List[Dict[str, str]]:
    """
    Retrieves the conversation history for a session from Vault (SQLite store).
    Returns list of {'role': 'user'|'ai', 'content': '...'} in chronological order,
    trimmed using the active short-term memory strategy (tokens or count) so LLM
    work contexts do not exceed model token or rate limits.
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
                return trim_history(history)
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
    return trim_history(fallback)


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
