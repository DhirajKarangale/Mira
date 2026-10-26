from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from .state import AgentState
from .timezone_helper import resolve_user_timezone
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
    "history_answer": (
        "User query is a follow-up, clarification, reformatting, or inquiry whose answer is already "
        "fully present in the current session's conversation history (e.g. 'which browser was that?', 'summarize that in 2 sentences', "
        "'how long was I in that meeting?', 'can you format that as a table?'). Does not require querying external vector database."
    ),
    "general_llm": (
        "General-purpose inquiry, coding help, explanations, facts, reasoning, greeting, chit-chat, "
        "math, writing assistance, or philosophical discussion that does NOT require querying the user's personal screen activity logs."
    ),
    "browser_automation": (
        "[Reserved Future Tool] Instructions to automate the web browser, click buttons, or scrape live web pages."
    ),
    "weather": (
        "User is asking about current weather conditions, weather forecasts, temperature, "
        "precipitation, rain, snowfall, humidity, wind speed, or meteorological forecasts for today or upcoming days."
    ),
    "news": (
        "[Reserved Future Tool] Inquiries strictly requesting latest breaking news headlines."
    ),
}

# Active routes supported in current deployment
ACTIVE_ROUTE_TARGETS = {"user_activity", "history_answer", "general_llm", "weather"}


def decision_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 2: Decision & Retrieval Planning Node.
    1. Understands query intent, required information, and expected detail level.
    2. Inspects conversation history to detect follow-ups and whether the answer
       is already present (routing to 'history_answer' to avoid redundant vector search).
    3. Plans retrieval parameters (search query, app filter, time expression) in a single
       reasoning step, eliminating redundant sequential LLM calls in user_activity_node.
    4. Routes to the most efficient execution path using LLM work 'decision' (temperature 0.0).
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")
    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)
    now_str = now_in_tz.strftime("%Y-%m-%d %I:%M %p (%A)")

    log(f"[DecisionNode] Evaluating query for user '{user_name}': '{user_query[:80]}...'")

    # Fast heuristic bypass for zero-history conversational greetings (0ms latency optimization)
    if not chat_history and _is_pure_conversational(user_query):
        log(f"[DecisionNode] Fast heuristic bypass: greeting/chit-chat -> 'general_llm'")
        return {
            "next_node": "general_llm",
            "decision_reasoning": "Conversational greeting/chit-chat without prior context",
            "is_follow_up": False,
            "can_answer_from_history": False,
            "detail_level": "concise",
            "resolved_query": user_query,
            "retrieval_plan": {},
            "tool_parameters": {},
        }

    # Format recent history context for decision making (last 8 turns for complete context)
    recent_turns: List[str] = []
    for item in chat_history[-8:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        clean_c = str(content).strip()
        if clean_c:
            speaker = user_name if role == "user" else "MIRA"
            recent_turns.append(f"{speaker}: {clean_c}")
    history_str = "\n".join(recent_turns) if recent_turns else "None (first turn in session)"

    prompt = f"""You are the Decision, Intent Routing, and Retrieval Planning module of MIRA, an intelligent desktop AI assistant.
Analyze the user's latest query, session conversation history, and current reference time.

Reference Time: {now_str} (Timezone: {user_tz})
User Name: {user_name}

Recent Conversation History for this session:
{history_str}

User's Latest Query: "{user_query}"

Instructions:
1. Understand Intent & Route:
   - "history_answer": The query is a follow-up, clarification, reformatting, or question whose answer is ALREADY present in the conversation history above (e.g. asking which browser was used when already listed, asking to summarize or reformat previous reply, asking about an entity already explained).
   - "user_activity": The user is asking about their personal activities, screen time, applications used, documents opened, or work history that REQUIRES querying the personal screen activity database.
   - "weather": The user is asking about current weather, weather forecasts, temperature, rain/precipitation, snowfall, humidity, wind speed, or meteorological conditions for today or upcoming days.
   - "general_llm": General knowledge, coding help, definitions, reasoning, greeting, or chit-chat that does not query personal screen logs or weather.
2. Follow-Up & Context Resolution:
   - "is_follow_up": true if the query refers to, continues, or relies on previous messages in this session.
   - "can_answer_from_history": true if the conversation history above already contains enough information to answer the question without querying Qdrant/vector store.
   - "resolved_query": If the query is a follow-up with ambiguous references (e.g. "what about after that?", "did I use it yesterday?"), rewrite it into a self-contained query with missing context resolved. Otherwise, keep original query.
3. Expected Answer Detail ("detail_level"):
   - "overview": For general activity questions (e.g. "what did I do today?", "summarize my day", "give me an overview of my morning").
   - "detailed": When the user explicitly requests full timeline, step-by-step logs, or all details (e.g. "tell me in detail everything I did", "give me the complete timeline", "detailed log of after 2pm").
   - "concise": For pinpoint/specific questions (e.g. "did I open WhatsApp?", "which file was open?", "how long was I in Edge?").
4. Retrieval Plan:
   - If route is "user_activity":
     - "search_query": Focused keywords for semantic vector search on summarized screen text (e.g. "projects repository code workspace", "WhatsApp chat", "editing code in VS Code", "reading documentation"). Set to null if broad general timeline.
     - "app_name": Specific desktop application name if requested (e.g. "Microsoft Edge", "Visual Studio Code", "WhatsApp", "Notepad", "Discord"), or null if general.
     - "time_expression": Specific time period IF mentioned or implied (e.g. "today after 2:00pm", "yesterday", "last 2 hours", "between 9 AM and 5 PM", "last month", "this morning").
       CRITICAL: If the user is asking broadly about projects, ongoing work, apps used, or work history WITHOUT specifying a date/time (e.g. "give me list of projects I am working on", "what projects am I working on?", "what have I worked on recently?"), set "time_expression" to null so that ALL available Knowledge Bases across all dates are searched.
   - If route is "weather":
     - "forecast_days": Integer (1 to 16) indicating number of forecast days requested. Set to 1 for current weather/today, 2 for tomorrow, 7 for a week, or the specific number of days asked (e.g. 3, 5, 10). Default to 7 if unspecified.

Return strictly a valid JSON object matching this schema:
{{
  "route": "user_activity" | "history_answer" | "weather" | "general_llm",
  "reasoning": "<brief 1-sentence explanation>",
  "is_follow_up": <true | false>,
  "can_answer_from_history": <true | false>,
  "detail_level": "overview" | "detailed" | "concise",
  "resolved_query": "<string>",
  "retrieval_plan": {{
    "search_query": "<string or null>",
    "app_name": "<string or null>",
    "time_expression": "<string or null>",
    "forecast_days": <integer or null>
  }}
}}
Do not include any extra text outside the JSON object.
"""

    route = "general_llm"
    reasoning = "Default general route"
    is_follow_up = False
    can_answer_from_history = False
    detail_level = _infer_detail_level(user_query)
    resolved_query = user_query
    retrieval_plan: Dict[str, Any] = {}

    try:
        raw_response = call_llm(prompt, work="decision")
        parsed = _parse_decision_json(raw_response)
        if parsed and "route" in parsed:
            candidate_route = str(parsed["route"]).strip().lower()
            reasoning = parsed.get("reasoning", "Classified by LLM decision node")
            is_follow_up = bool(parsed.get("is_follow_up", False))
            can_answer_from_history = bool(parsed.get("can_answer_from_history", False))
            detail_level = str(parsed.get("detail_level") or detail_level).lower().strip()
            if detail_level not in ("overview", "detailed", "concise"):
                detail_level = _infer_detail_level(user_query)
            resolved_query = parsed.get("resolved_query") or user_query
            retrieval_plan = parsed.get("retrieval_plan") or {}

            # Route resolution
            if can_answer_from_history and candidate_route in ("history_answer", "user_activity") and chat_history:
                route = "history_answer"
                reasoning = "Can be answered directly from session conversation history."
            elif candidate_route in ACTIVE_ROUTE_TARGETS:
                route = candidate_route
            elif candidate_route in AVAILABLE_ROUTES:
                log(f"[DecisionNode] Route '{candidate_route}' is reserved for future tools. Routing to general_llm.")
                route = "general_llm"
                reasoning = f"Reserved tool '{candidate_route}' requested; handled by general assistant."
            else:
                route, reasoning = _heuristic_fallback(user_query, chat_history)
        else:
            route, reasoning = _heuristic_fallback(user_query, chat_history)
    except Exception as e:
        log_error(f"[DecisionNode] LLM decision call failed: {e}. Applying heuristic fallback.")
        route, reasoning = _heuristic_fallback(user_query, chat_history)

    log(f"[DecisionNode] Final decision: route='{route}' (reasoning: {reasoning}, is_follow_up={is_follow_up}, detail={detail_level})")

    forecast_days = retrieval_plan.get("forecast_days")
    if route == "weather" and forecast_days is None:
        try:
            from .weather_tool import parse_forecast_days_from_query
            forecast_days = parse_forecast_days_from_query(user_query)
        except Exception:
            forecast_days = 7

    tool_params = {
        "search_query": retrieval_plan.get("search_query"),
        "app_name": retrieval_plan.get("app_name"),
        "time_expression": retrieval_plan.get("time_expression") or user_query,
        "forecast_days": forecast_days,
        "detail_level": detail_level,
        "resolved_query": resolved_query,
        "is_follow_up": is_follow_up,
        "can_answer_from_history": can_answer_from_history,
    }

    return {
        "next_node": route,
        "decision_reasoning": reasoning,
        "is_follow_up": is_follow_up,
        "can_answer_from_history": can_answer_from_history,
        "detail_level": detail_level,
        "resolved_query": resolved_query,
        "retrieval_plan": retrieval_plan,
        "tool_parameters": tool_params,
    }


def _infer_detail_level(query: str) -> str:
    """Deterministic rule to determine expected detail level from query terms."""
    q = query.lower().strip()
    detailed_terms = [
        "in detail", "detailed", "full details", "all details",
        "step by step", "complete timeline", "minute by minute",
        "everything i did", "full breakdown"
    ]
    if any(t in q for t in detailed_terms):
        return "detailed"

    overview_terms = [
        "what did i do", "what was i doing", "what have i done", "what i did",
        "overview", "summarize", "summary", "my day", "my activity", "my activities", "my work"
    ]
    if any(t in q for t in overview_terms):
        return "overview"

    concise_terms = [
        "which", "what time", "how long", "where was", "who was", "is it",
        "what file", "which app", "what website", "did i open", "did i use",
        "was i using", "was i in", "did i visit"
    ]
    if any(q.startswith(t) or f" {t} " in f" {q} " for t in concise_terms):
        return "concise"

    if q.startswith("did i ") or q.startswith("was i "):
        return "concise"

    return "overview"


def _is_pure_conversational(query: str) -> bool:
    """Detects simple greetings or chit-chat queries that require zero external retrieval."""
    q = query.strip().lower()
    greetings = {"hello", "hi", "hey", "good morning", "good afternoon", "good evening", "how are you", "who are you", "what can you do"}
    clean_q = re.sub(r'[^\w\s]', '', q).strip()
    return clean_q in greetings or any(clean_q.startswith(g + " ") for g in ("hello", "hi", "hey"))


def _parse_decision_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    cleaned = re.sub(r'```(?:json)?', '', text).strip('` \n\r\t')
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r'\{[^{}]*"route"[^{}]*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return None


def _heuristic_fallback(query: str, chat_history: Optional[List[Dict[str, Any]]] = None) -> Tuple[str, str]:
    """Deterministic rule-based backup in case LLM is completely unavailable."""
    q = query.strip().lower()
    q = re.sub(r'\byeste?r[ad]{1,2}y\b', 'yesterday', q)
    q = re.sub(r'\btod[ay]{1,2}\b', 'today', q)

    # Common greetings
    if _is_pure_conversational(q):
        return "general_llm", "Conversational greeting or chit-chat"

    # Follow-up indicators if chat history exists
    if chat_history and len(chat_history) > 0:
        follow_up_phrases = ["which one", "which browser", "what about that", "summarize that", "can you summarize", "in 2 sentences", "what time was that"]
        if any(p in q for p in follow_up_phrases):
            return "history_answer", "Heuristic matched follow-up phrase on existing history"

    # Weather indicators
    weather_phrases = [
        "weather", "forecast", "temperature outside", "is it raining",
        "will it rain", "is it going to rain", "chance of rain", "how hot is it",
        "how cold is it", "rain forecast", "snow forecast", "is it snowing",
        "wind speed outside", "humidity outside", "weather report",
        "weather update", "current weather", "what's the weather", "what is the weather",
    ]
    if any(p in q for p in weather_phrases):
        return "weather", "Heuristic matched weather inquiry phrase"

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
    has_time = any(t in q for t in ("yesterday", "today", "morning", "afternoon", "evening", "tonight", "last week", "last month", "past week", "between", "after", "before"))
    if has_self and has_time:
        return "user_activity", "Heuristic matched self-reference with time expression"

    return "general_llm", "Heuristic defaulted to general LLM"
