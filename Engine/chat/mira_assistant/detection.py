from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from .operations import is_mira_operational_query

logger = logging.getLogger("mira.engine.chat.mira_assistant.detection")

# Core keywords specifically targeting MIRA
MIRA_KEYWORDS = {
    "mira", "mira's", "mira assistant", "mira os", "mira system", "mira project",
    "mira codebase", "mira repo", "mira architecture", "mira modules",
}

# Subsystem & technology tokens associated with MIRA
MIRA_SUBSYSTEM_TERMS = [
    ("message broker", "redis stream"),
    ("message broker", "consumer group"),
    ("message broker", "pel"),
    ("message broker", "xack"),
    ("vault", "keyring"),
    ("vault", "chacha20"),
    ("vault", "encrypted"),
    ("vault", "config_storage"),
    ("memory", "tesseract"),
    ("memory", "deduplication"),
    ("memory", "qdrant"),
    ("memory", "perceptual hash"),
    ("memory", "retention"),
    ("operator", "screen capture"),
    ("operator", "rust"),
    ("operator", "blacklist"),
    ("operator", "frame capture"),
    ("engine", "llm failover"),
    ("engine", "langgraph"),
    ("engine", "qwen3-embedding"),
    ("engine", "sentence-transformers"),
    ("engine", "voice stt"),
    ("engine", "native mic"),
    ("client", "tauri"),
    ("client", "conversational awake"),
    ("client", "multi-session chat"),
    ("client", "dashboard cockpit"),
    ("build_mira_kb",),
    ("services.json",),
    ("package_windows.py",),
    ("start.py", "port conflict"),
    ("mira_knowledge_base",),
    # Voice, TTS, and Speech recognition terms
    ("female voice",),
    ("female voices",),
    ("male voice",),
    ("male voices",),
    ("voice model",),
    ("voice models",),
    ("voice engine",),
    ("elevenlabs",),
    ("eleven labs",),
    ("faster whisper",),
    ("faster-whisper",),
    ("voices", "available"),
    ("voice", "available"),
    ("voices", "have"),
    ("voice", "have"),
    ("voices", "list"),
    ("voice", "list"),
    ("voices", "support"),
    ("voice", "support"),
    ("tool", "voice"),
    ("voice from text",),
    ("generate voice",),
    ("text to speech",),
    ("tts",),
    ("stt",),
    ("speech to text",),
    ("voice", "using"),
    ("voice", "use"),
    # Direct project identity and creator questions
    ("what are you",),
    ("who are you",),
    ("who developed you",),
    ("who created you",),
    ("who made you",),
    ("who built you",),
    ("who is your creator",),
    ("who is your author",),
    ("who is your developer",),
    ("who programmed you",),
    # Daily Suggestions terms
    ("daily suggestion",),
    ("daily suggestions",),
    ("my suggestions",),
    ("morning briefing",),
    ("daily agenda",),
    ("refresh suggestions",),
    ("regenerate suggestions",),
    ("give", "suggestions"),
    ("list", "suggestions"),
    ("show", "suggestions"),
    ("suggestions", "here"),
    ("suggestions", "today"),
    ("list of suggestions",),
    # API key and credential terms
    ("api key",),
    ("api keys",),
    ("llm key",),
    ("llm keys",),
    ("ai priorities",),
    ("ai priority",),
    ("gemini key",),
    ("groq key",),
    ("elevenlabs key",),
    ("gnews key",),
    ("weather key",),
    ("keys", "add"),
    ("key", "add"),
    ("add", "keys"),
    ("add", "key"),
    ("update", "keys"),
    ("update", "key"),
    ("my keys",),
    ("configured keys",),
    # Configuration and user identity terms
    ("user profile",),
    ("user details",),
    ("app permissions",),
    ("app permission",),
    ("app blacklist",),
    ("engine workers",),
    ("worker config",),
    ("system retention",),
    # Streams, Services, and Storage terms
    ("redis stream",),
    ("redis streams",),
    ("message broker stream",),
    ("message broker streams",),
    ("stream lengths",),
    ("stream status",),
    ("pel status",),
    ("mira status",),
    ("mira health",),
    ("services status",),
    ("vault storage",),
    ("vault database",),
    ("database status",),
]

# Modifying action verbs indicating direct code modification request
MODIFICATION_VERBS = [
    r"\b(add|create|implement|write|build|generate)\s+(a\s+)?(new\s+)?(feature|endpoint|route|function|tool|helper|file|module|script|node|class)\b",
    r"\b(modify|update|edit|change|patch|refactor|fix|adjust)\s+(the\s+)?(code|file|implementation|config|endpoint|router|workflow|broker|function|timeout|setting)\b",
    r"\b(make\s+changes?|apply\s+changes?|modify\s+mira|update\s+mira|change\s+mira)\b",
    r"\b(change|set|update)\s+([a-zA-Z0-9_]+)\s+in\s+([a-zA-Z0-9_\-\./\\]+)\b",
]

# Personal user screen activity keywords that MUST NOT be routed to MIRA Assistant
PERSONAL_ACTIVITY_KEYWORDS = [
    "what did i do", "what was i doing", "what was on my screen", "my screen",
    "my activity", "my work today", "my timeline", "did i open", "did i use",
    "screen time", "apps i used", "what project was i working on yesterday",
    "summarize my day", "summarize my work", "what was i editing at",
    "how long was i in", "did i visit", "what tab was open"
]


def is_personal_activity_query(query: str) -> bool:
    """Detects if query is asking about personal screen time / desktop activity."""
    q = query.strip().lower()
    # Explicitly protect MIRA operational queries from being misclassified as personal screen activity
    mira_op_tokens = (
        "suggestion", "suggestions", "briefing", "agenda",
        "api key", "api keys", "llm key", "llm keys", "ai priorities",
        "add key", "add keys", "update key", "update keys", "set key", "set keys",
        "my keys", "show keys", "list keys", "keys configured",
        "redis stream", "user profile", "worker config", "mira status"
    )
    if any(tok in q for tok in mira_op_tokens):
        return False
    return any(w in q for w in PERSONAL_ACTIVITY_KEYWORDS)


def is_mira_conversation_history(chat_history: List[Dict[str, Any]]) -> bool:
    """
    Checks if the recent turns in chat history were discussing the MIRA project,
    its architecture, modules, or codebase.
    """
    if not chat_history:
        return False
        
    mira_history_terms = (
        "mira", "vault", "message broker", "operator", "subsystem",
        "engine", "memory", "client", "qdrant", "langgraph",
        "redis stream", "decision_node", "llm failover", "perceptual hash",
        "mira assistant"
    )

    recent_history = chat_history[-4:]
    for turn in reversed(recent_history):
        content = str(turn.get("content") or turn.get("user") or turn.get("ai") or "").lower()
        if any(kw in content for kw in mira_history_terms):
            return True
            
    return False


def detect_mira_intent(query: str) -> str:
    """
    Determines whether a MIRA-related query is 'MODIFICATION' or 'INFORMATIONAL'.
    """
    q = query.strip().lower()
    
    # Check for direct modification action verbs
    for pattern in MODIFICATION_VERBS:
        if re.search(pattern, q):
            return "MODIFICATION"

    # Keywords suggesting file modification
    if any(q.startswith(p) for p in ("add ", "create ", "modify ", "update ", "change ", "implement ", "refactor ", "fix the bug in ")):
        # If it refers to a file or module
        if any(ext in q for ext in (".py", ".rs", ".json", ".ts", ".tsx", ".md", ".toml", ".sql")) or any(m in q for m in ("engine", "vault", "operator", "memory", "broker", "client", "scripts")):
            return "MODIFICATION"

    return "INFORMATIONAL"


def detect_mira_query(
    query: str,
    chat_history: Optional[List[Dict[str, Any]]] = None
) -> Optional[Tuple[str, str, Dict[str, Any]]]:
    """
    Fast 0ms query detection for MIRA-related requests.
    Returns (route_name, reasoning, tool_parameters) or None.
    
    Route: 'mira_assistant'
    """
    q = query.strip().lower()
    clean_q = re.sub(r'[^\w\s]', ' ', q)
    words = set(clean_q.split())
    
    # Rule 0: If it's a personal user activity query, do NOT intercept
    if is_personal_activity_query(q):
        return None

    # Rule 1: Explicit MIRA mention
    has_mira_word = bool(words.intersection({"mira", "miras"})) or "mira " in q or " mira" in q
    
    # Rule 2: Subsystem combinations
    has_subsystem_match = False
    subsystem_matched = ""
    for terms in MIRA_SUBSYSTEM_TERMS:
        if all(term in q for term in terms):
            has_subsystem_match = True
            subsystem_matched = " + ".join(terms)
            break

    # Rule 3: File / codebase path mentions
    file_pattern = r'\b(engine|vault|memory|operator|message_broker|client|scripts)[/\\][a-zA-Z0-9_\-\./\\]+\b'
    has_file_path = bool(re.search(file_pattern, q))

    # Rule 4: Follow-up question in an ongoing MIRA conversation
    is_follow_up = False
    if chat_history and is_mira_conversation_history(chat_history):
        follow_up_indicators = [
            "which file", "where is that", "how does that work", "show me", "can you change",
            "can you update", "implement that", "make that change", "what about the api",
            "how do i configure that", "what parameters", "why is that", "explain more",
            "how do i run it", "is it possible to", "can we add", "test that", "can you show"
        ]
        if any(ind in q for ind in follow_up_indicators) or (len(q.split()) <= 6 and not any(w in q for w in ("weather", "news", "hello", "hi"))):
            is_follow_up = True

    # Check if this qualifies as a MIRA query
    op_info = is_mira_operational_query(query)
    is_operational = op_info is not None

    if has_mira_word or has_subsystem_match or has_file_path or is_follow_up or is_operational:
        intent = detect_mira_intent(query)
        op_category, op_action = op_info if op_info else (None, None)
        reasoning = (
            f"Fast heuristic: MIRA query detected (explicit_mira={has_mira_word}, "
            f"subsystem='{subsystem_matched}', file_path={has_file_path}, follow_up={is_follow_up}, "
            f"operational={is_operational}, intent={intent})"
        )
        tool_params = {
            "intent": intent,
            "has_mira_word": has_mira_word,
            "subsystem": subsystem_matched,
            "is_follow_up": is_follow_up,
            "is_operational": is_operational,
            "op_category": op_category,
            "op_action": op_action,
            "raw_query": query,
        }
        return "mira_assistant", reasoning, tool_params

    return None
