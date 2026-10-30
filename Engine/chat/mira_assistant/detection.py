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
    "how long was i in", "did i visit", "what tab was open",
    "what did i", "what was i", "what i did", "what i was", "what i worked on",
    "my activities", "my work", "activity history", "work history", "screen activities",
    "detailed version", "give me detailed", "more details", "in detail", "full details",
    "detailed timeline", "activity summary", "timeline of my", "what happened today",
    "what happened yesterday"
]


def is_personal_activity_query(query: str) -> bool:
    """Dynamically detects if a query is asking about personal screen time / desktop activity."""
    q = query.strip().lower()
    # Explicitly protect MIRA operational queries from being misclassified as personal screen activity
    mira_op_tokens = (
        "suggestion", "suggestions", "briefing", "agenda",
        "api key", "api keys", "llm key", "llm keys", "ai priorities",
        "add key", "add keys", "update key", "update keys", "set key", "set keys",
        "my keys", "show keys", "list keys", "keys configured", "check key",
        "key present", "key preset", "is this key", "in vault", "vault", "database",
        "config.db", "gnews", "groq", "gemini", "elevenlabs",
        "redis stream", "user profile", "worker config", "mira status"
    )
    if any(tok in q for tok in mira_op_tokens):
        return False

    words = set(re.findall(r'\b\w+\b', q))
    has_self = bool(words.intersection({"i", "my", "me", "we"}))
    has_act = any(w in words for w in {"do", "did", "doing", "done", "work", "worked", "working", "screen", "activity", "activities", "history", "timeline", "open", "opened", "use", "used", "using", "edit", "edited", "editing", "detail", "details", "detailed"})
    if has_self and has_act:
        return True

    return any(w in q for w in PERSONAL_ACTIVITY_KEYWORDS)


def is_mira_conversation_history(chat_history: List[Dict[str, Any]]) -> bool:
    """
    Checks if the recent turns in chat history were discussing the MIRA project,
    its architecture, modules, or codebase.
    """
    if not chat_history:
        return False
        
    # Check the most recent user turn: if user was asking about personal activity,
    # then this conversation is about personal activity, not MIRA codebase!
    for turn in reversed(chat_history[-4:]):
        role = turn.get("role") or ("user" if "user" in turn else "ai")
        content = str(turn.get("content") or turn.get("user") or turn.get("ai") or "").lower()
        if role == "user":
            if is_personal_activity_query(content):
                return False
            break

    mira_technical_terms = (
        "vault", "message broker", "operator", "subsystem",
        "redis stream", "decision_node", "llm failover", "perceptual hash",
        "mira assistant", "mira architecture", "mira codebase", "mira modules",
        "mira os", "mira system", "build_mira_kb", "qwen3-embedding",
        "key", "keys", "api key", "api keys", "gnews", "groq", "gemini",
        "elevenlabs", "voice model", "database", "daily suggestion", "daily suggestions",
    )

    recent_history = chat_history[-4:]
    for turn in reversed(recent_history):
        content = str(turn.get("content") or turn.get("user") or turn.get("ai") or "").lower()
        if any(kw in content for kw in mira_technical_terms):
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


def is_query_about_mira(q: str) -> bool:
    """
    Distinguishes queries genuinely asking about MIRA (its identity, architecture, creator,
    codebase, modules) from casual greetings or vocative addresses like 'Hey Mira, ...'
    where MIRA is not the subject of the request.
    """
    q_lower = q.strip().lower()

    # 1. Direct phrases where MIRA is the subject
    mira_subject_patterns = [
        r'\b(what|who|how|why|tell me about|explain|describe)\b.*\b(mira|meera)\b',
        r'\b(mira|meera)\b.*\b(architecture|modules?|codebase|repo|system|engine|vault|memory|operator|broker|features?|capabilities|version|framework|design)\b',
        r'\b(architecture|modules?|codebase|repo|system|engine|vault|memory|operator|broker|features?|capabilities|version|framework|design)\b.*\b(mira|meera)\b',
        r'\b(who|what)\s+(are\s+you|created\s+you|made\s+you|built\s+you|developed\s+you|programmed\s+you|is\s+your\s+creator|is\s+your\s+author|is\s+your\s+developer)\b',
        r'^\s*(what|who)\s+is\s+(mira|meera)\s*[\?\.\!]*$',
        r'^\s*(mira|meera)\s*[\?\.\!]*$',
    ]
    for pattern in mira_subject_patterns:
        if re.search(pattern, q_lower):
            return True

    # 2. Strip salutation / vocative prefixes: "Hey, Mira.", "Hey Mira,", "Mira, ...", "..., Mira"
    stripped = re.sub(r'^(hey|hi|hello|ok|okay|dear)?[,\s]*(mira|meera)\b[,\.\!\?\:\s]*', '', q_lower).strip()
    stripped = re.sub(r'[,\.\!\?\s]+(mira|meera)[,\.\!\?\s]*$', '', stripped).strip()

    # If after stripping the vocative greeting, the word 'mira' is still present as a topic
    if re.search(r'\b(mira|meera|miras|mira\'s)\b', stripped):
        return True

    return False


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

    # Check for MIRA operational query (keys, suggestions, redis, workers, db)
    op_info = is_mira_operational_query(query, chat_history=chat_history)
    is_operational = op_info is not None

    # Rule 0.5: If it is NOT an operational query, don't intercept weather or news
    if not is_operational:
        is_weather = any(w in q for w in ("weather", "forecast", "is it raining", "will it rain", "temperature", "how hot is it", "how cold is it"))
        if is_weather:
            return None
        is_news = any(n in q for n in ("top headlines", "latest news", "breaking news", "tech news", "sports news", "business news", "world news", "current headlines")) or re.search(r'\b(news\s+in|news\s+about|today\'s\s+news)\b', q)
        if is_news:
            return None

    # Rule 1: Explicit MIRA mention where MIRA is the subject (not just a greeting like 'Hey Mira')
    has_mira_word = is_query_about_mira(query)
    
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
        if any(ind in q for ind in follow_up_indicators):
            is_follow_up = True

    # Check if this qualifies as a MIRA query
    op_info = is_mira_operational_query(query, chat_history=chat_history)
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
