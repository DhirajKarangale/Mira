from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from .state import AgentState
from .timezone_helper import resolve_user_timezone
from ..mira_assistant.detection import detect_mira_query
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.decision")

# Extensible tool descriptions for routing
AVAILABLE_ROUTES = {
    "mira_assistant": (
        "User is asking questions about or interacting with MIRA (daily suggestions, viewing/refreshing/completing suggestions, "
        "API keys, configurations, user profile, engine workers, app permissions, Redis streams, databases, system health, "
        "architecture, modules, Engine, Vault, Memory, Operator, Message Broker, Client, scripts, voices, creator) "
        "or requesting to make changes or updates directly through chat."
    ),
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
        "User is asking about current news, latest news, breaking news, headlines, top stories, "
        "country-specific news, location/city news, category news (technology, business, sports, entertainment, health, science, world, politics), "
        "specific news topics, tags, or news from date ranges."
    ),
}

# Active routes supported in current deployment
ACTIVE_ROUTE_TARGETS = {"user_activity", "history_answer", "general_llm", "weather", "news", "mira_assistant"}


def _fast_route_heuristic(query: str, chat_history: List[Dict[str, Any]]) -> Optional[Tuple[str, str, Dict[str, Any]]]:
    """
    High-confidence 0ms routing heuristic that skips the decision LLM call entirely
    for unambiguous queries, reducing end-to-end response latency by 2-4 seconds.
    """
    q = query.strip().lower()
    clean_q = re.sub(r'[^\w\s]', '', q).strip()

    # Check for personal activity terms
    activity_words = ("what did i", "what was i", "my activity", "my work", "my screen", "screen time", "did i open", "did i use", "was i using")
    is_activity_query = any(w in q for w in activity_words)

    # 0. Check for MIRA query or project modification request (0ms fast path)
    if not is_activity_query:
        try:
            mira_match = detect_mira_query(query, chat_history)
            if mira_match is not None:
                return mira_match
        except Exception as e:
            logger.debug(f"[DecisionNode] Fast MIRA heuristic check notice: {e}")

    # 1. Pure conversational chit-chat / greetings / farewells / thanks
    greetings = {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "how are you", "who are you", "what can you do", "thanks", "thank you",
        "bye", "goodbye", "cool", "ok", "okay", "awesome", "great", "nice"
    }
    if clean_q in greetings or any(clean_q.startswith(g + " ") for g in ("hello", "hi", "hey")):
        return "general_llm", "Fast heuristic: Conversational greeting/chit-chat", {}

    # 2. Unambiguous weather query (when not asking about past personal activity)
    weather_terms = ("weather", "forecast", "is it raining", "will it rain", "temperature outside", "rain forecast", "how hot is it", "how cold is it")
    if not is_activity_query and any(w in q for w in weather_terms):
        return "weather", "Fast heuristic: Weather query", {}

    # 3. Unambiguous news query (when not asking about past personal activity)
    news_terms = ("top headlines", "latest news", "breaking news", "tech news", "sports news", "business news", "world news", "current headlines")
    if not is_activity_query and any(n in q for n in news_terms):
        return "news", "Fast heuristic: News query", {}

    # 4. Unambiguous general technical / coding / comparison query
    coding_pattern = r'\b(write|create|implement|give me|show me|how to)\s+(a\s+)?([a-z]+\s+)?(python|javascript|typescript|c\+\+|java|go|rust|sql|html|css|code|function|script|algorithm|regex|query|program|implement|build)\b'
    comp_pattern = r'\b(which\s+(?:llm|model|framework|language|tool|one)?\s*(?:is|are)\s+better|difference\s+between|compare\s+|versus|\bvs\b)'
    if not is_activity_query and not chat_history:
        if re.search(coding_pattern, q) or re.search(comp_pattern, q):
            return "general_llm", "Fast heuristic: Technical / coding / comparison query", {}

    # 5. Explanatory / informational questions
    has_news_kw = any(k in q for k in ("news", "headline", "headlines", "breaking", "article", "articles"))
    explanation_starters = (
        "can you tell me about", "tell me about", "explain why", "why did", "why do",
        "what is the reason", "how come", "what happened to", "what happened with",
        "explain how", "what is the capital", "calculate ", "solve "
    )
    if not is_activity_query and not has_news_kw and not chat_history and any(q.startswith(p) for p in explanation_starters):
        return "general_llm", "Fast heuristic: General explanation / informational query", {}

    return None


def decision_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 2: Decision & Retrieval Planning Node.
    1. Fast heuristic routing (0ms) for high-confidence queries to eliminate redundant LLM call.
    2. Fallback to LLM intent classification with strict English language instruction.
    3. Plans retrieval parameters in a single step.
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")
    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)
    now_str = now_in_tz.strftime("%Y-%m-%d %I:%M %p (%A)")

    log(f"[DecisionNode] Evaluating query for user '{user_name}': '{user_query[:80]}...'")

    # Fast heuristic routing bypass (0ms latency optimization)
    fast_route = _fast_route_heuristic(user_query, chat_history)
    if fast_route is not None:
        target_route, route_reasoning, default_plan = fast_route
        log(f"[DecisionNode] Fast heuristic bypass -> '{target_route}' ({route_reasoning})")
        detail_level = _infer_detail_level(user_query)

        forecast_days = None
        weather_location = None
        if target_route == "weather":
            from .weather_tool import parse_forecast_days_from_query, parse_location_from_query
            forecast_days = parse_forecast_days_from_query(user_query, default=7)
            weather_location = parse_location_from_query(user_query)

        tool_params = {
            "search_query": None,
            "app_name": None,
            "time_expression": user_query,
            "forecast_days": forecast_days,
            "location": weather_location,
            "news_plan": None,
            "detail_level": detail_level,
            "resolved_query": user_query,
            "is_follow_up": default_plan.get("is_follow_up", False) if isinstance(default_plan, dict) else False,
            "can_answer_from_history": False,
        }
        if isinstance(default_plan, dict):
            tool_params.update(default_plan)

        return {
            "next_node": target_route,
            "decision_reasoning": route_reasoning,
            "is_follow_up": tool_params.get("is_follow_up", False),
            "can_answer_from_history": False,
            "detail_level": detail_level,
            "resolved_query": user_query,
            "retrieval_plan": default_plan,
            "tool_parameters": tool_params,
        }

    # Format recent history context for decision making (last 6 turns for fast context)
    recent_turns: List[str] = []
    for item in chat_history[-6:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        clean_c = str(content).strip()
        if clean_c:
            speaker = user_name if role == "user" else "MIRA"
            recent_turns.append(f"{speaker}: {clean_c}")
    history_str = "\n".join(recent_turns) if recent_turns else "None (first turn in session)"

    prompt = f"""Analyze the user query, recent history, and reference time to determine the route and retrieval parameters.

Reference Time: {now_str} (Timezone: {user_tz})
User Name: {user_name}

Recent Conversation History:
{history_str}

User Query: "{user_query}"

Routes:
- "mira_assistant": Questions or actions regarding MIRA (daily suggestions, viewing/refreshing/completing suggestions, API keys, configurations, user profile, Redis streams, databases, system health, architecture, code) or project modifications.
- "history_answer": Query answered directly from the conversation history above.
- "user_activity": Questions about user's personal screen activity, apps used, or work history.
- "weather": Weather conditions, forecasts, or temperature.
- "news": Recent headlines or news articles.
- "general_llm": General knowledge, coding, or chit-chat not requiring tools.

Return strictly a valid JSON object matching this schema:
{{
  "route": "mira_assistant" | "user_activity" | "history_answer" | "weather" | "news" | "general_llm",
  "reasoning": "<brief 1-sentence explanation in English>",
  "is_follow_up": <true | false>,
  "can_answer_from_history": <true | false>,
  "detail_level": "overview" | "detailed" | "concise",
  "resolved_query": "<string in English>",
  "retrieval_plan": {{
    "search_query": "<string or null>",
    "app_name": "<string or null>",
    "time_expression": "<string or null>",
    "forecast_days": <integer or null>,
    "location": "<string or null>",
    "intent": "<INFORMATIONAL or MODIFICATION>",
    "news_plan": {{
      "operation": "top_headlines" | "search",
      "q": "<string or null>",
      "category": "<string or null>",
      "country": "<string or null>",
      "location": "<string or null>",
      "lang": "en",
      "sortby": "publishedAt" | "relevance",
      "time_expression": "<string or null>",
      "max_results": <integer or null>
    }}
  }}
}}
All values must be in English. Output only the JSON object with no surrounding text.
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
    weather_location = retrieval_plan.get("location")
    if route == "weather":
        from .weather_tool import parse_forecast_days_from_query, parse_location_from_query
        if forecast_days is None:
            try:
                forecast_days = parse_forecast_days_from_query(user_query)
            except Exception:
                forecast_days = 7
        if not weather_location:
            try:
                weather_location = parse_location_from_query(user_query)
            except Exception:
                weather_location = None

    news_plan = retrieval_plan.get("news_plan")
    if route == "news":
        try:
            from .news_tool import plan_news_query
            news_plan = plan_news_query(user_query, user_profile, llm_plan=news_plan)
        except Exception:
            pass

    tool_params = {
        "search_query": retrieval_plan.get("search_query"),
        "app_name": retrieval_plan.get("app_name"),
        "time_expression": retrieval_plan.get("time_expression") or user_query,
        "forecast_days": forecast_days,
        "location": weather_location,
        "news_plan": news_plan,
        "detail_level": detail_level,
        "resolved_query": resolved_query,
        "is_follow_up": is_follow_up,
        "can_answer_from_history": can_answer_from_history,
        "intent": retrieval_plan.get("intent", "INFORMATIONAL"),
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

    return "overview"


def _is_pure_conversational(query: str) -> bool:
    """Detects simple greetings or chit-chat queries that require zero external retrieval."""
    q = query.strip().lower()
    greetings = {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "how are you", "who are you", "what can you do", "thanks", "thank you",
        "bye", "goodbye", "cool", "ok", "okay", "awesome", "great", "nice"
    }
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

    # 1. Common greetings
    if _is_pure_conversational(q):
        return "general_llm", "Conversational greeting or chit-chat"

    # 2. MIRA indicators
    if any(w in q for w in ("mira", "vault", "message broker", "operator", "redis stream")):
        return "mira_assistant", "Heuristic matched MIRA keyword"

    # 3. Follow-up indicators if chat history exists
    if chat_history and len(chat_history) > 0:
        follow_up_phrases = ["which one", "which browser", "what about that", "summarize that", "can you summarize", "in 2 sentences", "what time was that"]
        if any(p in q for p in follow_up_phrases):
            return "history_answer", "Heuristic matched follow-up phrase on existing history"

    # 4. Weather indicators
    weather_phrases = [
        "weather", "forecast", "temperature outside", "is it raining",
        "will it rain", "is it going to rain", "chance of rain", "how hot is it",
        "how cold is it", "rain forecast", "snow forecast", "is it snowing",
        "wind speed outside", "humidity outside", "weather report",
        "weather update", "current weather", "what's the weather", "what is the weather",
    ]
    if any(p in q for p in weather_phrases):
        return "weather", "Heuristic matched weather inquiry phrase"

    # 5. News indicators
    news_phrases = [
        "news", "headlines", "headline", "top stories", "breaking news",
        "current events", "latest news", "tech news", "sports news",
        "business news", "world news", "news update", "news briefing",
        "daily news", "in the news", "what's the news", "what is the news"
    ]
    if any(p in q for p in news_phrases):
        return "news", "Heuristic matched news inquiry phrase"

    # 6. Explicit activity phrases
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

    # 7. Time indicators with self-reference ('i', 'my', 'me')
    words = re.findall(r'\b\w+\b', q)
    has_self = any(w in words for w in ("i", "my", "me", "we"))
    has_time = any(t in q for t in ("yesterday", "today", "morning", "afternoon", "evening", "tonight", "last week", "last month", "past week", "between", "after", "before"))
    if has_self and has_time:
        return "user_activity", "Heuristic matched self-reference with time expression"

    return "general_llm", "Heuristic defaulted to general LLM"
