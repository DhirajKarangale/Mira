from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List
from .state import AgentState
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.decision")

# Extensible tool descriptions for routing
AVAILABLE_ROUTES = {
    "user_activity": (
        "User is asking about their personal activities, screen time, past work history, "
        "applications opened (e.g. VS Code, Edge, Chrome, WhatsApp, Notepad), documents worked on, "
        "projects, daily progress, or past timeline (e.g. 'what did I work on today?', 'what was I doing yesterday?', "
        "'summarize my work between 9 AM and 5 PM', 'did I open Discord yesterday?', 'what project was I editing?')."
    ),
    "general_llm": (
        "General-purpose inquiry, coding help, explanations, facts, reasoning, greeting, chit-chat, "
        "math, writing assistance, or philosophical discussion that does NOT require querying the user's personal screen activity logs."
    ),
    "browser_automation": (
        "[Reserved Future Tool] Instructions to automate the web browser, click buttons, or scrape live web pages."
    ),
    "weather": (
        "[Reserved Future Tool] Questions strictly asking for real-time weather forecasts or current meteorological conditions."
    ),
    "news": (
        "[Reserved Future Tool] Inquiries strictly requesting latest breaking news headlines."
    ),
}

# Active routes supported in current deployment
ACTIVE_ROUTE_TARGETS = {"user_activity", "general_llm"}


def decision_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 2: Decision Node.
    Analyzes the user query and session context to determine whether the request
    needs information from the user's past activity history (Qdrant) or a general LLM response.
    Uses LLM work category 'decision' configured in config.json with temperature 0.0.
    Extensible for future tools.
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")

    log(f"[DecisionNode] Evaluating query for user '{user_name}': '{user_query[:80]}...'")

    # Format recent history context for decision making
    recent_turns: List[str] = []
    for item in chat_history[-3:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        if content:
            recent_turns.append(f"{role.capitalize()}: {content}")
    history_str = "\n".join(recent_turns) if recent_turns else "None"

    # Route description formatting
    routes_text = "\n".join([f"- '{k}': {v}" for k, v in AVAILABLE_ROUTES.items()])

    prompt = f"""You are the Decision and Intent Routing module of MIRA, an intelligent desktop AI assistant.
Your task is to classify the user's query into the single most appropriate execution route.

Available Routes:
{routes_text}

Context:
User Name: {user_name}
Recent Chat History:
{history_str}

User's Latest Query: "{user_query}"

Instructions:
1. If the user asks about their own activities, what they did, applications used, screen time, work history, projects worked on, or what happened at a specific date/time on their computer, classify as "user_activity".
2. If the user asks general knowledge, coding questions, creative writing, definitions, greeting, or chit-chat, classify as "general_llm".
3. Provide your answer strictly as a JSON object matching this schema:
{{
  "route": "user_activity" | "general_llm",
  "reasoning": "<brief 1-sentence reason for this decision>"
}}
Do not include any extra text outside the JSON object.
"""

    route = "general_llm"
    reasoning = "Default general route"

    try:
        raw_response = call_llm(prompt, work="decision")
        parsed = _parse_decision_json(raw_response)
        if parsed and "route" in parsed:
            candidate_route = str(parsed["route"]).strip().lower()
            if candidate_route in ACTIVE_ROUTE_TARGETS:
                route = candidate_route
                reasoning = parsed.get("reasoning", "Classified by LLM decision node")
            elif candidate_route in AVAILABLE_ROUTES:
                # Reserved tool requested but not yet implemented; fallback gracefully to general_llm with notice
                log(f"[DecisionNode] Route '{candidate_route}' is reserved for future tools. Routing to general_llm.")
                route = "general_llm"
                reasoning = f"Reserved tool '{candidate_route}' requested; handled by general assistant."
            else:
                route, reasoning = _heuristic_fallback(user_query)
        else:
            route, reasoning = _heuristic_fallback(user_query)
    except Exception as e:
        log_error(f"[DecisionNode] LLM decision call failed: {e}. Applying heuristic fallback.")
        route, reasoning = _heuristic_fallback(user_query)

    log(f"[DecisionNode] Final decision: route='{route}' (reasoning: {reasoning})")

    return {
        "next_node": route,
        "decision_reasoning": reasoning,
    }


def _parse_decision_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    # Strip markdown code fences if present
    cleaned = re.sub(r'```(?:json)?', '', text).strip('` \n\r\t')
    try:
        return json.loads(cleaned)
    except Exception:
        # Try extracting JSON object substring
        match = re.search(r'\{[^{}]*"route"[^{}]*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return None


def _heuristic_fallback(query: str) -> tuple[str, str]:
    """
    Deterministic rule-based backup in case LLM is completely unavailable.
    """
    q = query.strip().lower()
    q = re.sub(r'\byeste?r[ad]{1,2}y\b', 'yesterday', q)
    q = re.sub(r'\btod[ay]{1,2}\b', 'today', q)

    # Common greetings and conversational pleasantries (even if containing 'today')
    if any(q.startswith(g) for g in ("hello", "hi ", "hey ", "good morning", "good afternoon", "good evening", "how are you", "who are you")):
        if not any(k in q for k in ("what did i", "my activity", "my screen", "did i open", "summarize my")):
            return "general_llm", "Conversational greeting or chit-chat"

    # Explicit activity phrases
    activity_phrases = [
        "what did i do", "what was i doing", "what i did", "what i worked on",
        "did i open", "did i use", "was i using", "did i work",
        "my activity", "my activities", "my work", "my screen", "my day",
        "screen activities", "screen activity", "screen time",
        "work summary", "activity summary", "summarize my",
        "what was on my screen", "work history", "activity history",
        "what did i",
    ]
    for phrase in activity_phrases:
        if phrase in q:
            return "user_activity", f"Heuristic matched activity phrase '{phrase}'"

    # Time indicators with self-reference ('i', 'my', 'me')
    words = re.findall(r'\b\w+\b', q)
    has_self = any(w in words for w in ("i", "my", "me", "we"))
    has_time = any(t in q for t in ("yesterday", "today", "morning", "afternoon", "evening", "tonight", "last week", "last month", "past week", "between"))
    if has_self and has_time:
        return "user_activity", "Heuristic matched self-reference with time expression"

    return "general_llm", "Heuristic defaulted to general LLM"

