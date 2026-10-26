from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
import json
import logging
import random
import re
from typing import Any, Dict, List, Optional, Set, Tuple
import requests

from .vault_client import (
    fetch_latest_daily_suggestions,
    fetch_daily_suggestions_history,
    fetch_previous_daily_suggestions,
    save_daily_suggestions_data,
)
from .config import DEFAULT_SUGGESTIONS_INTERVAL_HOURS, get_vault_base_url
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


def is_same_day_as_today(date_val: Any, user_profile: Optional[Dict[str, Any]] = None) -> bool:
    """
    Checks if a given timestamp falls on the same calendar day as 'today'
    in the user's configured timezone.
    """
    if not date_val:
        return False
    dt = parse_timestamp(date_val)
    if not dt:
        return False
    user_tz = resolve_user_timezone(user_profile or {})
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_in_user_tz = dt.astimezone(user_tz)
    now_in_user_tz = datetime.now(user_tz)
    return dt_in_user_tz.date() == now_in_user_tz.date()


def is_suggestions_refresh_needed(
    record: Optional[Dict[str, Any]],
    user_profile: Optional[Dict[str, Any]] = None,
    interval_hours: float = DEFAULT_SUGGESTIONS_INTERVAL_HOURS,
) -> bool:
    """
    Checks if suggestions refresh is needed.
    Suggestions for one day are constant: if suggestions exist for today, no refresh is needed.
    Only returns True if record/suggestions are empty or if suggestions are from a previous day.
    """
    if not record:
        return True
    suggestions_data = record.get("suggestions")
    date_suggestions = record.get("date_suggestions")
    if not suggestions_data or suggestions_data == [] or suggestions_data == "[]":
        return True
    if not date_suggestions:
        return True

    # If suggestions were generated on the same calendar day, do NOT regenerate (keep constant)
    if is_same_day_as_today(date_suggestions, user_profile):
        return False

    return True


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

    # Base count on overall completion rate
    if overall_rate >= 0.75:
        count = random.choice([7, 8, 9])
    elif overall_rate >= 0.45:
        count = random.choice([5, 6, 7])
    else:
        count = random.choice([4, 5])

    # Adjust for weekend pattern if applicable
    if is_weekend:
        if weekend_rate < weekday_rate:
            count = max(4, count - 1)
    else:
        if weekday_rate > weekend_rate and count < 8:
            count = min(9, count + 1)

    return max(4, min(count, 9))


def analyze_suggestions_history(
    history: List[Dict[str, Any]],
    is_weekend: bool,
    now_dt: Optional[datetime] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Evaluates historical suggestions from the past two weeks:
    - Calculates overall, weekday, and weekend completion rates.
    - Determines target suggestion count to avoid overloading the user.
    - Extracts pending/unfinished tasks from yesterday's session to prioritize ongoing work.
    - Generates pacing guidance based on demonstrated completion capacity.
    """
    records_with_sugg = [
        r for r in history
        if r.get("suggestions") and len(r.get("suggestions", [])) > 0
    ]

    target_count = determine_suggestion_count(history, is_weekend=is_weekend)

    if not records_with_sugg:
        return {
            "target_count": target_count,
            "overall_rate": 0.5,
            "weekday_rate": 0.5,
            "weekend_rate": 0.5,
            "total_suggestions": 0,
            "total_completed": 0,
            "pending_from_yesterday": [],
            "pace_guidance": "No prior completion history available. Target a balanced, moderate pace.",
        }

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
            if ts_dt.weekday() in (5, 6):
                weekend_sugg += s_count
                weekend_comp += c_count
            else:
                weekday_sugg += s_count
                weekday_comp += c_count

    overall_rate = (total_comp / total_sugg) if total_sugg > 0 else 0.5
    weekend_rate = (weekend_comp / weekend_sugg) if weekend_sugg > 0 else overall_rate
    weekday_rate = (weekday_comp / weekday_sugg) if weekday_sugg > 0 else overall_rate

    # Find the most recent previous day's record that is NOT today
    previous_record = None
    for r in records_with_sugg:
        d_val = r.get("date_suggestions")
        if not is_same_day_as_today(d_val, user_profile):
            previous_record = r
            break

    pending_from_yesterday: List[str] = []
    if previous_record:
        prev_suggs = previous_record.get("suggestions") or []
        prev_completed = set(previous_record.get("completed") or [])
        for idx, text in enumerate(prev_suggs):
            if idx not in prev_completed and isinstance(text, str) and text.strip():
                pending_from_yesterday.append(text.strip())

    if overall_rate >= 0.75:
        pace_guidance = f"User has demonstrated high task completion ({overall_rate * 100:.0f}%). They thrive on clear, ambitious productivity."
    elif overall_rate >= 0.45:
        pace_guidance = f"User has demonstrated moderate task completion ({overall_rate * 100:.0f}%). Maintain a steady, focused daily pace."
    else:
        pace_guidance = f"User has demonstrated lower task completion ({overall_rate * 100:.0f}%). Strictly avoid overloading; prioritize 4-5 high-impact, bite-sized tasks."

    return {
        "target_count": target_count,
        "overall_rate": overall_rate,
        "weekday_rate": weekday_rate,
        "weekend_rate": weekend_rate,
        "total_suggestions": total_sugg,
        "total_completed": total_comp,
        "pending_from_yesterday": pending_from_yesterday,
        "pace_guidance": pace_guidance,
    }


def fetch_recent_user_goals_from_chat(limit_sessions: int = 3) -> List[str]:
    """
    Retrieves recent user chat messages from Vault to extract explicitly discussed
    goals, deadlines, commitments, or reminders that the user spoke to MIRA about.
    """
    vault_base = get_vault_base_url()
    goals: List[str] = []
    try:
        resp = requests.get(f"{vault_base}/chats/sessions", params={"limit": limit_sessions}, timeout=1.5)
        if resp.status_code != 200:
            return []
        data = resp.json()
        sessions = data.get("items") or []
        goal_keywords = (
            "goal", "deadline", "remind me", "need to", "have to", "finish",
            "complete", "by tomorrow", "by friday", "hackathon", "apply", "submit", "project"
        )
        for s in sessions[:limit_sessions]:
            sid = s.get("session_id")
            if not sid:
                continue
            m_resp = requests.get(f"{vault_base}/chats/sessions/{sid}", params={"limit": 10}, timeout=1.5)
            if m_resp.status_code == 200:
                messages = m_resp.json().get("items") or []
                for m in messages:
                    if m.get("role") == "user":
                        c = str(m.get("content") or "").strip()
                        c_lower = c.lower()
                        if any(gk in c_lower for gk in goal_keywords):
                            cleaned_snippet = c[:120].strip()
                            if cleaned_snippet and cleaned_snippet not in goals:
                                goals.append(cleaned_snippet)
                                if len(goals) >= 4:
                                    return goals
    except Exception as e:
        logger.debug(f"[SuggestionsSection] Chat goals extraction skipped: {e}")
    return goals


def retrieve_rich_activity_signals(user_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Queries Activity Knowledge Base (past 48 hours) and performs deep contextual analysis:
      1. Ongoing projects, workspaces, repos, and active codebases.
      2. Multiple projects and context switching patterns.
      3. Evidence of frustration (recurring errors, stuck debugging loops) - ONLY with evidence.
      4. Learning opportunities and researched documentation topics.
      5. Smart reminders (hackathons, job portals, uncommitted code, routines).
      6. Chronological session timeline.
    """
    default_signals = {
        "activity_summary": "No screen activity recorded in the past 2 days.",
        "ongoing_work": [],
        "active_apps": [],
        "context_switching": {"detected": False, "evidence": "Single-focus or minimal activity."},
        "frustration": {"detected": False, "evidence": "No frustration or recurring error patterns detected."},
        "learning": {"detected": False, "topics": [], "evidence": "No documentation lookups or learning gaps observed."},
        "reminders": {"detected": False, "items": [], "evidence": "No pending hackathons, jobs, or uncommitted code observed."},
        "most_recent_session": "None",
        "has_activity": False,
    }

    try:
        from chat.workflow.user_activity_node import (
            _find_relevant_knowledge_bases,
            _search_across_knowledge_bases,
            _build_session_blocks,
        )
    except Exception as e:
        logger.debug(f"[SuggestionsSection] Could not import user_activity_node: {e}")
        return default_signals

    user_tz = resolve_user_timezone(user_profile)
    now_utc = datetime.now(timezone.utc)
    start_ts = int(now_utc.timestamp()) - 172800  # 48 hours
    end_ts = int(now_utc.timestamp())

    try:
        kb_dirs = _find_relevant_knowledge_bases(start_ts, end_ts, user_tz)
        if not kb_dirs:
            return default_signals

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
            return default_signals

        # 1. Build session blocks
        session_blocks = _build_session_blocks(records, max_blocks=25)
        lines: List[str] = []
        for s in session_blocks:
            app = s.get("app_name", "Unknown App")
            time_span = s.get("start_fmt", "")
            if s.get("end_fmt") and s.get("end_fmt") != time_span:
                time_span = f"{time_span} - {s['end_fmt']}"
            actions = "; ".join(s.get("actions", [])) if s.get("actions") else "Active"
            lines.append(f"- [{time_span}] {app}: {actions}")

        activity_summary = "\n".join(lines)

        # 2. Extract active apps
        active_apps = list({r.get("app_name", "").strip() for r in records if r.get("app_name")})

        # 3. Identify Ongoing Projects & Codebases
        project_candidates: Set[str] = set()
        file_candidates: Set[str] = set()

        path_pattern = re.compile(r'([a-zA-Z0-9_\-\.\/\\]+\.(?:py|tsx?|jsx?|rs|go|java|cpp|html|css|json|sql|md))', re.IGNORECASE)
        repo_pattern = re.compile(r'\b(?:project|repo|workspace|folder|branch)\s+[:=]?\s*["\']?([a-zA-Z0-9_\-]+)["\']?', re.IGNORECASE)

        for r in records:
            txt = str(r.get("summarized_text") or "")
            for m in path_pattern.findall(txt):
                fname = m.replace("\\", "/").split("/")[-1]
                if len(fname) > 2:
                    file_candidates.add(fname)
            for m in repo_pattern.findall(txt):
                if len(m) > 2 and m.lower() not in ("the", "this", "main", "true", "false"):
                    project_candidates.add(m)
            # Detect known workspace components
            for kw in ("Mira", "Engine", "Client", "Vault", "Memory", "Operator", "Message_Broker"):
                if kw.lower() in txt.lower():
                    project_candidates.add(kw)

        ongoing_work: List[str] = []
        if project_candidates:
            ongoing_work.append(f"Projects/Repositories: {', '.join(sorted(project_candidates)[:4])}")
        if file_candidates:
            ongoing_work.append(f"Active Files: {', '.join(sorted(file_candidates)[:5])}")

        most_recent_session = lines[-1] if lines else "None"

        # 4. Multiple Projects & Context Switching Analysis
        distinct_recent_projects = list(project_candidates)
        is_context_switching = len(distinct_recent_projects) >= 2 and len(active_apps) >= 4
        ctx_switching_data = {
            "detected": is_context_switching,
            "evidence": f"Frequent toggling across {len(distinct_recent_projects)} projects ({', '.join(distinct_recent_projects[:3])}) and multiple applications." if is_context_switching else "Focused, single-stream workflow with minimal context switching.",
        }

        # 5. Frustration / Troubleshooting Loop Analysis
        # STRICT RULE: Do NOT assume frustration without supporting evidence.
        error_keywords = (
            "traceback", "syntaxerror", "typeerror", "connectionrefused",
            "cannot import", "unhandled exception", "failed test", "build failed",
            "fatal error", "segfault", "compilation error", "merge conflict",
        )
        error_matches: List[str] = []
        for r in records:
            txt = str(r.get("summarized_text") or "").lower()
            for ek in error_keywords:
                if ek in txt:
                    error_matches.append(ek)
                    break

        frustration_detected = len(error_matches) >= 3
        if frustration_detected:
            frust_evidence = f"Recurring errors/failures detected ({', '.join(sorted(set(error_matches))[:3])}) across multiple recent sessions."
        else:
            frust_evidence = "No frustration or recurring error patterns detected."

        frustration_data = {
            "detected": frustration_detected,
            "evidence": frust_evidence,
            "advice_needed": frustration_detected or is_context_switching,
        }

        # 6. Learning & Skill Opportunities Analysis
        learning_keywords = (
            "docs.", "stackoverflow.com", "developer.mozilla.org", "github.com/issues",
            "tutorial", "documentation", "api reference", "cheatsheet", "how to"
        )
        researched_topics: Set[str] = set()
        tech_terms = ("fastapi", "react", "typescript", "python", "rust", "tailwind", "qdrant", "docker", "sqlite", "sqlcipher", "vite", "redis")
        for r in records:
            txt = str(r.get("summarized_text") or "").lower()
            if any(lk in txt for lk in learning_keywords):
                for tt in tech_terms:
                    if tt in txt:
                        researched_topics.add(tt.capitalize())

        learning_detected = bool(researched_topics)
        learning_data = {
            "detected": learning_detected,
            "topics": sorted(researched_topics),
            "evidence": f"Researched documentation/troubleshooting for: {', '.join(sorted(researched_topics))}" if learning_detected else "No documentation lookups or learning gaps observed.",
        }

        # 7. Smart Reminders & Discovered Opportunities Analysis
        reminder_items: List[str] = []
        for r in records:
            txt = str(r.get("summarized_text") or "")
            t_low = txt.lower()
            if any(k in t_low for k in ("hackathon", "devpost.com", "unstop.com")):
                reminder_items.append("Follow up on hackathon / dev competition exploration")
                break
            if any(k in t_low for k in ("linkedin.com/jobs", "wellfound.com", "indeed.com", "careers")):
                reminder_items.append("Follow up on job / role opportunities recently explored")
                break
            if "pull request" in t_low or "draft pr" in t_low:
                reminder_items.append("Review or submit pending pull request")
                break

        reminders_detected = bool(reminder_items)
        reminders_data = {
            "detected": reminders_detected,
            "items": reminder_items,
            "evidence": "; ".join(reminder_items) if reminders_detected else "No pending hackathons, job explorations, or unsubmitted PRs observed.",
        }

        return {
            "activity_summary": activity_summary,
            "ongoing_work": ongoing_work,
            "active_apps": active_apps,
            "context_switching": ctx_switching_data,
            "frustration": frustration_data,
            "learning": learning_data,
            "reminders": reminders_data,
            "most_recent_session": most_recent_session,
            "has_activity": True,
        }
    except Exception as e:
        log_error(f"[SuggestionsSection] Error analyzing rich activity signals: {e}")
        return default_signals


def retrieve_recent_user_activity(user_profile: Dict[str, Any]) -> str:
    """
    Backward-compatible wrapper retrieving user activity from the past 48 hours.
    """
    signals = retrieve_rich_activity_signals(user_profile)
    return signals.get("activity_summary") or ""


def generate_daily_suggestions_with_llm(
    target_count: int,
    user_name: str,
    user_profile: Dict[str, Any],
    activity_summary: str,
    now_dt: datetime,
    history_signals: Optional[Dict[str, Any]] = None,
    activity_signals: Optional[Dict[str, Any]] = None,
    chat_goals: Optional[List[str]] = None,
) -> List[str]:
    """
    Generates target_count personalized, practical, inspiring, and actionable daily recommendations.
    Adheres strictly to the 9 core requirements:
      1. Ongoing Work: Track progress on existing projects; prioritize finishing in-flight tasks.
      2. Multiple Projects & Frustration: Evidence-based context switching / frustration relief.
      3. Weekend Planning: Balanced weekend plan (work + outings/friends/family + relaxation).
      4. Daily Planning: Realistic flow based on priorities, deadlines, and activity patterns without overloading.
      5. Accuracy & Context: Grounded strictly in Activity KB & User KB. Zero hallucinations.
      6. Actionable Suggestions: Clear purpose, concrete verbs, achievable timeframe.
      7. Learning & Improvement: Targeted study only when supported by activity gaps or current goals.
      8. Smart Reminders: Follow up on verified hackathons, job applications, PRs, or routines.
      9. Personalized Tone: Friendly, concise, and lightly humorous or roast-like without sacrificing clarity.
    """
    day_name = now_dt.strftime("%A")
    date_str = now_dt.strftime("%B %d, %Y")
    is_weekend = now_dt.weekday() in (5, 6)

    # 1. Profile Context (User Knowledge Base)
    prof_parts = []
    if user_profile.get("role"):
        prof_parts.append(f"Role: {user_profile.get('role')}")
    if user_profile.get("city"):
        loc = f"{user_profile.get('city')}, {user_profile.get('country')}" if user_profile.get("country") else user_profile.get("city")
        prof_parts.append(f"Location: {loc}")
    if user_profile.get("notes"):
        prof_parts.append(f"Context/Notes: {user_profile.get('notes')}")

    profile_text = "; ".join(prof_parts) if prof_parts else "Standard user profile"
    raw_name = str(user_profile.get("user_name") or user_name or "").strip()
    user_name = raw_name if raw_name else "there"
    city_name = str(user_profile.get("city") or "your area").strip()

    # 2. History & Completion Signals
    hs = history_signals or {}
    overall_rate = hs.get("overall_rate", 0.5)
    weekday_rate = hs.get("weekday_rate", 0.5)
    weekend_rate = hs.get("weekend_rate", 0.5)
    pace_guidance = hs.get("pace_guidance") or "Maintain balanced, steady pacing."
    pending_yesterday = hs.get("pending_from_yesterday") or []
    if pending_yesterday:
        pending_yesterday_text = "\n".join(f"  - [Pending]: {t}" for t in pending_yesterday[:3])
    else:
        pending_yesterday_text = "  - None (All previous suggestions completed or fresh start)."

    # 3. Activity Signals (Activity Knowledge Base)
    act_sig = activity_signals or {}
    ongoing_work_list = act_sig.get("ongoing_work") or []
    ongoing_work_text = "; ".join(ongoing_work_list) if ongoing_work_list else "Recent workspace development"
    active_apps = act_sig.get("active_apps") or []
    most_recent_session = act_sig.get("most_recent_session") or "None"

    ctx_data = act_sig.get("context_switching") or {}
    ctx_detected = ctx_data.get("detected", False)
    ctx_evidence = ctx_data.get("evidence", "")

    frust_data = act_sig.get("frustration") or {}
    frust_detected = frust_data.get("detected", False)
    frust_evidence = frust_data.get("evidence", "")

    learn_data = act_sig.get("learning") or {}
    learn_detected = learn_data.get("detected", False)
    learn_evidence = learn_data.get("evidence", "")
    learn_topics = learn_data.get("topics") or []

    rem_data = act_sig.get("reminders") or {}
    rem_detected = rem_data.get("detected", False)
    rem_evidence = rem_data.get("evidence", "")
    rem_items = rem_data.get("items") or []

    cg = chat_goals or []
    chat_goals_text = "; ".join(cg) if cg else "None stated"

    has_activity = bool(activity_summary and activity_summary.strip())
    activity_context = activity_summary if has_activity else "No screen activity recorded in the past 2 days."

    if is_weekend:
        weekend_planning_instruction = (
            "- Today is a WEEKEND (Saturday / Sunday). Create a balanced, rejuvenating weekend plan:\n"
            "  * 1-2 focused personal projects, side dev work, or wrapping up loose ends.\n"
            f"  * 1-2 rejuvenation, outing, outdoor, or friends/family moments (tailored to user context in {city_name}).\n"
            "  * 1 relaxation, hobby, or entertainment suggestion (music, movie, reading, unwinding).\n"
            "  * Keep the tone refreshing and non-stressful. Avoid grueling weekday grinds."
        )
    else:
        weekend_planning_instruction = (
            "- Today is a WEEKDAY. Focus on high-impact deep work, core project milestones, and sustainable execution without overloading."
        )

    prompt = f"""You are MIRA, a personal AI assistant known for being sharp, intelligent, delightfully witty, and deeply practical.
Today is {day_name}, {date_str}.
Day Type: {'WEEKEND (Saturday/Sunday)' if is_weekend else 'WEEKDAY'}
User Name: {user_name}
User Context (User Knowledge Base): {profile_text}

---
1. PREVIOUS SUGGESTIONS & COMPLETION RATE:
- 14-day completion rate: {overall_rate * 100:.0f}% (Weekday: {weekday_rate * 100:.0f}%, Weekend: {weekend_rate * 100:.0f}%)
- Pacing guidance: {pace_guidance}
- Pending / unfinished tasks from yesterday's suggestions:
{pending_yesterday_text}

---
2. RECENT ONGOING WORK & WORKSPACE ACTIVITY (Activity Knowledge Base - Past 48h):
- Primary projects & active codebases: {ongoing_work_text}
- Active applications: {', '.join(active_apps) if active_apps else 'None recorded'}
- Most recent activity: {most_recent_session}
- Timeline of recent sessions:
{activity_context}

---
3. ACTIVITY SIGNALS & EVIDENCE ANALYSIS:
- Context Switching: {'YES - ' + ctx_evidence if ctx_detected else 'NONE - Single-focus workflow'}
- Frustration / Troubleshooting: {'YES - ' + frust_evidence if frust_detected else 'NONE - Smooth workflow detected (Do NOT assume frustration)'}
- Learning & Knowledge Gaps: {'YES - ' + learn_evidence if learn_detected else 'NONE - No documentation lookups'}
- Smart Reminders & Discovered Opportunities: {'YES - ' + rem_evidence if rem_detected else 'NONE - No explored hackathons/jobs/PRs'}
- Recent Stated Chat Goals: {chat_goals_text}

---
TASK:
Generate exactly {target_count} personalized, practical, and actionable daily suggestions for today.

STRICT PLANNING RULES:
1. ONGOING WORK (Prioritize existing work):
   - Track progress on verified active tasks and projects ({ongoing_work_text}).
   - Prioritize completing existing in-flight work before introducing unnecessary new tasks.
   - If there are unfinished suggestions from yesterday, prioritize continuing or wrapping them up.
   - Suggest the next logical step based on demonstrated progress and known pending items.

2. MULTIPLE PROJECTS & FRUSTRATION:
   - Review the Frustration & Context Switching section above.
   - STRICT CONSTRAINT: Do NOT assume frustration without supporting evidence.
   - If frustration or high context switching is confirmed by evidence: suggest concrete ways to prioritize work, break complex tasks into bite-sized steps, or pause switching between projects.
   - If NO frustration is detected: proceed with steady, productive momentum.

3. WEEKEND vs WEEKDAY PLANNING:
   {weekend_planning_instruction}

4. DAILY PLANNING & FLOW:
   - Organize the suggestions into a realistic daily flow without overloading the day.
   - Morning/Start: Deep focus on top priority milestone or finishing in-flight work.
   - Mid-day: Secondary tasks, code review, or targeted follow-up.
   - Later: Smart reminder, learning gap, or winding down.

5. ACCURACY & CONTEXT (Zero Hallucination):
   - Ground every single suggestion strictly in the verified context above.
   - STRICT CONSTRAINT: Do NOT invent fake tasks, phantom deadlines, unverified clients, imaginary relationships, or fabricated preferences. If a detail is not in the context, do NOT invent it.

6. ACTIONABLE SUGGESTIONS:
   - Each suggestion must have a clear purpose and be achievable within today's timeframe.
   - Start with an action verb and specify the concrete component, file, or objective.

7. LEARNING & IMPROVEMENT:
   - If learning/documentation research is confirmed in Evidence above, suggest studying that specific topic or practicing that skill to support the ongoing project.
   - STRICT CONSTRAINT: Only include learning tasks if they directly support current ongoing work. Do NOT invent random courses.

8. SMART REMINDERS:
   - If hackathons, job applications, uncommitted code, open PRs, or routines are confirmed in Evidence or chat goals above, include a smart reminder to follow up.
   - Do NOT invent deadlines or commitments that were not documented.

9. PERSONALIZED TONE:
   - Keep suggestions concise, friendly, and lightly humorous or roast-like (MIRA's signature witty charm), without sacrificing clarity or usefulness.
   - Length: Exactly 1 to 2 short sentences per suggestion (maximum 28 words).
   - Return strictly a valid JSON array of {target_count} strings:
[
  "Suggestion 1",
  "Suggestion 2",
  ...
]
Do NOT include any markdown asterisks inside strings or text outside the JSON array."""

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

    # Deterministic fallback strictly grounded in verified signals
    fallback_suggestions: List[str] = []

    # 1. Roll forward yesterday's pending tasks first
    for pending_task in pending_yesterday:
        fallback_suggestions.append(f"Finish pending work from yesterday: {pending_task}")
        if len(fallback_suggestions) >= 2:
            break

    # 2. Next logical task on ongoing project
    if ongoing_work_list:
        fallback_suggestions.append(f"Continue active progress on {ongoing_work_list[0]} — tackle the next core milestone.")

    # 3. Context switching / frustration resolution if detected
    if frust_detected:
        fallback_suggestions.append("Step back and break down the tricky error into 2 smaller, isolated test cases before diving back in.")
    elif ctx_detected:
        fallback_suggestions.append("Lock in on one primary project for your morning block to minimize context-switching fatigue.")

    # 4. Learning task if evidence present
    if learn_detected and learn_topics:
        fallback_suggestions.append(f"Spend 20 focused minutes reviewing {learn_topics[0]} documentation to solidify your implementation.")

    # 5. Smart reminder if present
    if rem_detected and rem_items:
        fallback_suggestions.append(f"Follow up on your explored opportunity: {rem_items[0]}.")

    # 6. Weekend balance vs Weekday productivity
    if is_weekend:
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append(f"Take a refreshing weekend outing or walk in {city_name} to recharge your mind away from screens.")
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append("Spend quality time catching up with family or friends without thinking about code.")
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append("Unwind this evening with your favorite music or movie to rest up for the coming week.")
    else:
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append("Run the test suite and verify edge cases across your recent commits before wrapping up.")
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append("Take a dedicated 15-minute stretch and hydration break to keep your energy high.")
        if len(fallback_suggestions) < target_count:
            fallback_suggestions.append("Review your uncommitted changes and push a clean git commit to lock in today's progress.")

    # Trim or pad to target_count
    return fallback_suggestions[:target_count]


async def refresh_suggestions(force: bool = False, force_regenerate: bool = False) -> List[str]:
    """
    Executes Daily Suggestions refresh:
      - Daily suggestions for a given calendar day are constant.
      - If suggestions already exist for today and force_regenerate is False:
        returns existing suggestions without calling LLM or overwriting completion states.
      - If today has no suggestions, or if it is a new day, or force_regenerate is True:
        generates personalized practical suggestions via LLM and persists them.
    """
    user_profile = await asyncio.to_thread(get_user_profile, force_refresh=True) or {}
    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)

    has_suggestions_today = bool(
        current_record
        and current_record.get("suggestions")
        and len(current_record.get("suggestions", [])) > 0
        and is_same_day_as_today(current_record.get("date_suggestions"), user_profile)
    )

    if has_suggestions_today and not force_regenerate:
        log("[SuggestionsSection] Daily suggestions for today already exist (constant for the day). Returning existing data.")
        return current_record.get("suggestions") or []

    log("[SuggestionsSection] Initiating daily suggestions generation (new day or forced regeneration)...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("suggestions", {"status": "refreshing"})
    except Exception:
        pass

    user_name = user_profile.get("user_name") or "there"
    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)
    is_weekend = now_in_tz.weekday() in (5, 6)

    # 1. Fetch 14-day history and analyze completion rates & pending tasks
    history = await asyncio.to_thread(fetch_daily_suggestions_history, days=14)
    history_signals = analyze_suggestions_history(history, is_weekend=is_weekend, now_dt=now_in_tz, user_profile=user_profile)
    target_count = history_signals.get("target_count") or 5

    # 2. Retrieve rich activity signals from Activity Knowledge Base (past 48 hours)
    activity_signals = await asyncio.to_thread(retrieve_rich_activity_signals, user_profile)
    activity_summary = activity_signals.get("activity_summary") or ""

    # 3. Retrieve recent chat goals/commitments from Vault if available
    chat_goals = await asyncio.to_thread(fetch_recent_user_goals_from_chat)

    log(
        f"[SuggestionsSection] Planning context assembled: Target count={target_count}, "
        f"is_weekend={is_weekend}, pending_yesterday={len(history_signals.get('pending_from_yesterday', []))}, "
        f"frustration={activity_signals.get('frustration', {}).get('detected')}, "
        f"learning={activity_signals.get('learning', {}).get('detected')}, "
        f"reminders={activity_signals.get('reminders', {}).get('detected')}"
    )

    # 4. Generate personalized practical suggestions via LLM
    suggestions = await asyncio.to_thread(
        generate_daily_suggestions_with_llm,
        target_count=target_count,
        user_name=user_name,
        user_profile=user_profile,
        activity_summary=activity_summary,
        now_dt=now_in_tz,
        history_signals=history_signals,
        activity_signals=activity_signals,
        chat_goals=chat_goals,
    )

    if not suggestions:
        log_error("[SuggestionsSection] Suggestion generation produced empty results. Skipping persistence.")
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
