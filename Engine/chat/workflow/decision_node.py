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
        "User is asking about current news, latest news, breaking news, headlines, top stories, "
        "country-specific news, location/city news, category news (technology, business, sports, entertainment, health, science, world, politics), "
        "specific news topics, tags, or news from date ranges."
    ),
}

# Active routes supported in current deployment
ACTIVE_ROUTE_TARGETS = {"user_activity", "history_answer", "general_llm", "weather", "news"}


def _fast_route_heuristic(query: str, chat_history: List[Dict[str, Any]]) -> Optional[Tuple[str, str, Dict[str, Any]]]:
    """
    High-confidence 0ms routing heuristic that skips the decision LLM call entirely
    for unambiguous queries, reducing end-to-end response latency by 2-4 seconds.
    """
    q = query.strip().lower()
    clean_q = re.sub(r'[^\w\s]', '', q).strip()

    # 1. Pure conversational chit-chat / greetings / farewells / thanks
    greetings = {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "how are you", "who are you", "what can you do", "thanks", "thank you",
        "bye", "goodbye", "cool", "ok", "okay", "awesome", "great", "nice"
    }
    if clean_q in greetings or any(clean_q.startswith(g + " ") for g in ("hello", "hi", "hey")):
        return "general_llm", "Fast heuristic: Conversational greeting/chit-chat", {}

    # Check for personal activity terms
    activity_words = ("what did i", "what was i", "my activity", "my work", "my screen", "screen time", "did i open", "did i use", "was i using")
    is_activity_query = any(w in q for w in activity_words)

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

    # 5. Explanatory / informational questions (e.g. "can you tell me about X and why Y", "explain why X happened")
    # when not explicitly asking for news headlines or live articles
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
        tool_params = {
            "search_query": None,
            "app_name": None,
            "time_expression": user_query,
            "forecast_days": 7 if target_route == "weather" else None,
            "news_plan": None,
            "detail_level": detail_level,
            "resolved_query": user_query,
            "is_follow_up": False,
            "can_answer_from_history": False,
        }
        return {
            "next_node": target_route,
            "decision_reasoning": route_reasoning,
            "is_follow_up": False,
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

    prompt = f"""You are the Decision, Intent Routing, and Retrieval Planning module of MIRA, an intelligent desktop AI assistant.
Analyze the user's latest query, session conversation history, and current reference time.

CRITICAL LANGUAGE REQUIREMENT: You MUST respond in English only. All JSON field values and reasoning must be in English.

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
   - "news": The user is specifically asking for recent, breaking, or current news articles, headlines, or live journalistic updates (e.g. "latest tech news", "breaking news today", "what are the headlines", "news about Tesla").
   - "general_llm": General knowledge, coding help, historical/analytical explanations (e.g. "tell me about Microsoft and why companies do layoffs", "explain quantum computing", "how does an engine work"), definitions, reasoning, greeting, or chit-chat that does not query personal screen logs, weather, or news.
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
     - "forecast_days": Integer (1 to 16) indicating number of forecast days requested. Set to 1 for current weather/today, 2 for tomorrow, 7 for a week, or the specific number of days asked. Default to 7 if unspecified.
   - If route is "news":
     - "news_plan":
       - "operation": "top_headlines" for trending, breaking, or category headlines; OR "search" for specific topics, entities, companies, people, events, cities/regions, or date ranges.
       - "q": Pure alphanumeric search keywords or topic (e.g. "Microsoft layoffs", "Apple earnings", "AI chip breakthrough"). IMPORTANT: Do NOT include commas, question marks, punctuation, or special characters in "q".
       - "category": Category string if applicable ("general", "world", "nation", "business", "technology", "entertainment", "sports", "science", "health"), or null.
       - "country": 2-letter ISO country code if specific country requested (e.g. "us", "in", "gb"), or null.
       - "location": Specific city or region name if mentioned (e.g. "Chicago", "Tokyo", "London"), or null.
       - "lang": 2-letter language code (default "en").
       - "sortby": "publishedAt" or "relevance".
       - "time_expression": Time period if specified (e.g. "yesterday", "past week", "past 24 hours"), or null.
       - "max_results": Integer 1 to 10 (enforce max 10 for free plan).

Return strictly a valid JSON object matching this schema:
{{
  "route": "user_activity" | "history_answer" | "weather" | "news" | "general_llm",
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
        "news_plan": news_plan,
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

    # News indicators
    news_phrases = [
        "news", "headlines", "headline", "top stories", "breaking news",
        "current events", "latest news", "tech news", "sports news",
        "business news", "world news", "news update", "news briefing",
        "daily news", "in the news", "what's the news", "what is the news"
    ]
    if any(p in q for p in news_phrases):
        return "news", "Heuristic matched news inquiry phrase"

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

