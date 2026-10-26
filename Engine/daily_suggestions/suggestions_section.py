from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import random
import re
from typing import Any, Dict, List, Optional, Tuple

from .vault_client import (
    fetch_latest_daily_suggestions,
    fetch_daily_suggestions_history,
    save_daily_suggestions_data,
)
from .config import DEFAULT_SUGGESTIONS_INTERVAL_HOURS
from chat.websocket import ws_manager
from chat.workflow.timezone_helper import resolve_user_timezone
from config import get_user_profile
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.suggestions_section")


def parse_timestamp(ts: Any) -> Optional[datetime]:
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts
    s = str(ts).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return None


def is_suggestions_refresh_needed(
    record: Optional[Dict[str, Any]],
    interval_hours: float = DEFAULT_SUGGESTIONS_INTERVAL_HOURS,
) -> bool:
    if not record:
        return True
    suggestions_data = record.get("suggestions")
    date_suggestions = record.get("date_suggestions")
    if not suggestions_data or suggestions_data == [] or suggestions_data == "[]":
        return True
    if not date_suggestions:
        return True
    dt = parse_timestamp(date_suggestions)
    if not dt:
        return True
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta_seconds = (now - dt).total_seconds()
    return delta_seconds >= (interval_hours * 3600)


def determine_suggestion_count(history: List[Dict[str, Any]], is_weekend: bool) -> int:
    """
    Analyzes available suggestions from the previous two weeks (14 days):
      - Evaluates completion rates, completion dates, and weekday/weekend patterns.
      - Adjusts number based on user's demonstrated activity and completion patterns.
      - If no history exists, chooses a random number between 4 and 9.
    """
    records_with_sugg = [
        r for r in history
        if r.get("suggestions") and len(r.get("suggestions", [])) > 0
    ]

    if not records_with_sugg:
        chosen = random.randint(4, 9)
        log(f"[SuggestionsSection] No suggestions history found. Chose random count: {chosen}")
        return chosen

    total_sugg = 0
    total_comp = 0
    weekend_sugg = 0
    weekend_comp = 0
    weekday_sugg = 0
    weekday_comp = 0

    for r in records_with_sugg:
        s_count = len(r.get("suggestions", []))
        c_count = len(r.get("completed", []))
        total_sugg += s_count
        total_comp += c_count

        ts_dt = parse_timestamp(r.get("date_suggestions"))
        if ts_dt:
            # 5 is Saturday, 6 is Sunday
            if ts_dt.weekday() in (5, 6):
                weekend_sugg += s_count
                weekend_comp += c_count
            else:
                weekday_sugg += s_count
                weekday_comp += c_count

    overall_rate = (total_comp / total_sugg) if total_sugg > 0 else 0.5
    weekend_rate = (weekend_comp / weekend_sugg) if weekend_sugg > 0 else overall_rate
    weekday_rate = (weekday_comp / weekday_sugg) if weekday_sugg > 0 else overall_rate

    log(
        f"[SuggestionsSection] Analyzed {len(records_with_sugg)} past days: "
        f"overall_rate={overall_rate:.2f}, weekday_rate={weekday_rate:.2f}, "
        f"weekend_rate={weekend_rate:.2f}, is_weekend={is_weekend}"
    )

    # Base count on overall completion rate
    if overall_rate >= 0.75:
        # High completer: user stays on top of tasks
        count = random.choice([7, 8, 9])
    elif overall_rate >= 0.45:
        # Moderate completer
        count = random.choice([5, 6, 7])
    else:
        # Lower completer: do not overwhelm with a long list
        count = random.choice([4, 5])

    # Adjust for weekend pattern if applicable
    if is_weekend:
        if weekend_rate < weekday_rate:
            count = max(4, count - 1)
    else:
        if weekday_rate > weekend_rate and count < 8:
            count = min(9, count + 1)

    return max(4, min(count, 9))


def retrieve_recent_user_activity(user_profile: Dict[str, Any]) -> str:
    """
    Retrieves user activity from the previous two days (48 hours)
    using the existing Activity Knowledge Base search and clustering mechanisms.
    """
    try:
        from chat.workflow.user_activity_node import (
            _find_relevant_knowledge_bases,
            _search_across_knowledge_bases,
            _build_session_blocks,
        )
    except Exception as e:
        logger.debug(f"[SuggestionsSection] Could not import user_activity_node methods: {e}")
        return ""

    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)
    now_utc = datetime.now(timezone.utc)
    start_ts = int(now_utc.timestamp()) - 172800  # 48 hours ago
    end_ts = int(now_utc.timestamp())

    try:
        kb_dirs = _find_relevant_knowledge_bases(start_ts, end_ts, user_tz)
        if not kb_dirs:
            return ""

        records = _search_across_knowledge_bases(
            kb_dirs=kb_dirs,
            search_query=None,
            app_name=None,
            start_ts=start_ts,
            end_ts=end_ts,
            user_tz=user_tz,
            limit=250,
        )
        if not records:
            return ""

        session_blocks = _build_session_blocks(records, max_blocks=25)
        lines: List[str] = []
        for s in session_blocks:
            app = s.get("app_name", "Unknown App")
            time_span = s.get("start_fmt", "")
            if s.get("end_fmt") and s.get("end_fmt") != time_span:
                time_span = f"{time_span} - {s['end_fmt']}"
            actions = "; ".join(s.get("actions", [])) if s.get("actions") else "Active"
            lines.append(f"- [{time_span}] {app}: {actions}")

        return "\n".join(lines)
    except Exception as e:
        log_error(f"[SuggestionsSection] Error querying Knowledge Base activity: {e}")
        return ""


def generate_daily_suggestions_with_llm(
    target_count: int,
    user_name: str,
    user_profile: Dict[str, Any],
    activity_summary: str,
    now_dt: datetime,
) -> List[str]:
    """
    Generates target_count practical, personalized daily suggestions using LLM.
    Strictly forbids inventing fake tasks, deadlines, or user activities.
    """
    day_name = now_dt.strftime("%A")
    date_str = now_dt.strftime("%B %d, %Y")

    prof_parts = []
    if user_profile.get("role"):
        prof_parts.append(f"Role: {user_profile.get('role')}")
    if user_profile.get("city"):
        prof_parts.append(f"Location: {user_profile.get('city')}, {user_profile.get('country')}")
    if user_profile.get("notes"):
        prof_parts.append(f"Context/Notes: {user_profile.get('notes')}")

    profile_text = "; ".join(prof_parts) if prof_parts else "Standard user profile"

    has_activity = bool(activity_summary and activity_summary.strip())
    activity_context = activity_summary if has_activity else "No screen activity recorded in the past 2 days."

    raw_name = str(user_profile.get("user_name") or "").strip()
    user_name = raw_name if raw_name else "there"
    display_suffix = f", {raw_name}" if raw_name else ""
    user_display = f"User Name: {raw_name}" if raw_name else "User Name: (Not configured yet)"

    prompt = f"""You are MIRA, a helpful, intelligent, and highly practical personal AI assistant.
Today is {day_name}, {date_str}.
{user_display}
User Context: {profile_text}

Confirmed Activity from Past 2 Days (from Activity Knowledge Base):
{activity_context}

Task:
Generate exactly {target_count} personalized, practical, inspiring, and actionable daily recommendations for today.

Strict Guidelines:
1. Tone: Motivating, actionable, professional, and practical. Focus on high productivity, deep work, code quality, and sustainable daily focus habits.
2. Grounded & Actionable: Each suggestion MUST recommend a real, concrete, useful action tied to ongoing projects, coding tasks, architecture, testing, or balanced work routines.
3. Absolutely NO joke or mock dummy tasks (do NOT mention "42 browser tabs", "chair memorized posture", or sarcastic roasts). Make them genuinely valuable and constructive.
4. Keep each suggestion concise (1 to 2 short sentences, maximum 28 words), punchy, and clear.
5. Return strictly a JSON array of {target_count} strings:
[
  "Suggestion 1",
  "Suggestion 2",
  ...
]
Do not output any introductory or concluding text outside the JSON array."""

    try:
        raw_resp = call_llm(prompt, work="summarization")
        cleaned = re.sub(r'```(?:json)?', '', raw_resp).strip('` \n\r\t')
        match = re.search(r'\[\s*".*"\s*\]', cleaned, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list) and len(parsed) >= 1:
                clean_list = [str(x).strip() for x in parsed if str(x).strip()]
                if len(clean_list) >= 1:
                    return clean_list[:target_count]
    except Exception as e:
        log_error(f"[SuggestionsSection] LLM suggestion generation failed: {e}")

    # Never return hardcoded or dummy suggestions. Return empty list so the frontend shows loading state.
    return []


async def refresh_suggestions(force: bool = False) -> List[str]:
    """
    Executes Daily Suggestions refresh:
      1. Checks daily_suggestions table.
      2. If not needed and not forced, returns current data.
      3. Determines count from 2-week history & weekday/weekend pattern (or random 4-9).
      4. Retrieves past 2 days activity from Activity Knowledge Base.
      5. Retrieves User Knowledge Base context from Vault.
      6. Identifies ongoing work & generates personalized practical suggestions via LLM.
      7. Stores suggestions, creation timestamp, and resets completion state in Vault.
      8. Broadcasts updated suggestions to frontend via WebSockets.
    """
    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)
    if not force and not is_suggestions_refresh_needed(current_record):
        log("[SuggestionsSection] Daily suggestions are already up-to-date. Skipping refresh.")
        return current_record.get("suggestions") or []

    log("[SuggestionsSection] Initiating daily suggestions refresh...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("suggestions", {"status": "refreshing"})
    except Exception:
        pass

    user_profile = await asyncio.to_thread(get_user_profile, force_refresh=True) or {}
    user_name = user_profile.get("user_name") or "there"
    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)
    is_weekend = now_in_tz.weekday() in (5, 6)

    # 1. Determine number of suggestions based on 2-week history
    history = await asyncio.to_thread(fetch_daily_suggestions_history, days=14)
    target_count = determine_suggestion_count(history, is_weekend=is_weekend)

    # 2. Retrieve user's activity from the previous 2 days
    activity_summary = await asyncio.to_thread(retrieve_recent_user_activity, user_profile)
    log(f"[SuggestionsSection] Activity context retrieved: {len(activity_summary)} chars. Target count: {target_count}")

    # 3. Generate practical personalized suggestions via LLM
    suggestions = await asyncio.to_thread(
        generate_daily_suggestions_with_llm,
        target_count=target_count,
        user_name=user_name,
        user_profile=user_profile,
        activity_summary=activity_summary,
        now_dt=now_in_tz,
    )

    if not suggestions:
        log_error("[SuggestionsSection] LLM suggestion generation produced empty results. Skipping persistence.")
        return []

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Store in Vault (resetting completed list for the new set of daily suggestions)
    saved_record = await asyncio.to_thread(
        save_daily_suggestions_data,
        {
            "suggestions": suggestions,
            "date_suggestions": now_iso,
            "completed": [],
        }
    )

    log(f"[SuggestionsSection] Generated {len(suggestions)} suggestions and persisted to Vault.")

    # Broadcast over WebSocket
    try:
        await ws_manager.broadcast_daily_suggestions_update(
            "suggestions",
            {
                "status": "ready",
                "suggestions": suggestions,
                "date_suggestions": now_iso,
                "completed": [],
                "record_id": saved_record.get("id"),
            }
        )
    except Exception as e:
        log_error(f"[SuggestionsSection] Failed to broadcast suggestions update via WebSocket: {e}")

    return suggestions
