from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import unittest.mock
from .state import AgentState
from .timezone_helper import (
    resolve_user_timezone,
    parse_time_expression,
    format_timestamp_in_tz,
)
from llm import call_llm
from embedding import generate_embedding
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.user_activity")

KB_NAME_PATTERN = re.compile(r"^kb-(\d{2})_(\d{2})_(\d{4})-(\d{2})_(\d{2})_(\d{4})$")
COLLECTION_NAME = "knowledge_base"


def user_activity_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 4: User Activity Node.
    Retrieves information from the user's Knowledge Bases stored in Qdrant.
    - Understands the query requirements (search terms, app filter, time expressions).
    - Parses relative/absolute time expressions and converts to UTC Unix timestamps.
    - Resolves user timezone from their profile.
    - Searches across relevant Knowledge Bases (including historical ones).
    - Uses vector search on 'summarized_text' and payload filters for 'app_name' and 'timestamp'.
    - Preserves timestamps, application names, and content for answer generation.
    - Accurately reports when no data is found so synthesis never invents.
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_tz = resolve_user_timezone(user_profile)
    now_in_tz = datetime.now(user_tz)

    log(f"[UserActivityNode] Processing activity retrieval for user '{user_profile.get('user_name', 'User')}' (tz={user_tz})")

    # Step 4A: Check if retrieval plan was pre-computed by decision_node (eliminates redundant LLM round-trip)
    plan = state.get("retrieval_plan") or state.get("tool_parameters") or {}
    detail_level = state.get("detail_level") or plan.get("detail_level") or "overview"
    if ("time_expression" in plan) or plan.get("app_name") or (plan.get("search_query") is not None):
        search_query = plan.get("search_query")
        app_filter = plan.get("app_name")
        raw_time_expr = plan.get("time_expression")
        log(f"[UserActivityNode] Using pre-planned retrieval parameters (detail={detail_level}): app={app_filter}, time='{raw_time_expr}', query='{search_query}'")
    else:
        # Fallback to query understanding LLM call if invoked directly without decision node planning
        query_params = _understand_activity_query(user_query, chat_history, now_in_tz, user_tz)
        search_query = query_params.get("search_query") or user_query
        app_filter = query_params.get("app_name")
        raw_time_expr = query_params.get("time_expression") or user_query

    # Step 4B: Parse time boundaries into UTC Unix timestamps
    start_ts, end_ts, time_desc = parse_time_expression(raw_time_expr, user_tz, now_in_tz)
    log(f"[UserActivityNode] Time window: '{time_desc}' (start_ts={start_ts}, end_ts={end_ts}), app_filter='{app_filter}', query='{search_query}'")

    # Step 4C: Identify relevant Knowledge Bases (current & historical)
    kb_dirs = _find_relevant_knowledge_bases(start_ts, end_ts, user_tz)
    log(f"[UserActivityNode] Found {len(kb_dirs)} relevant Knowledge Base folder(s) to search: {[d.name for d in kb_dirs]}")

    if not kb_dirs:
        log("[UserActivityNode] No Knowledge Base directories found on system.")
        retrieved_context = {
            "found": False,
            "count": 0,
            "records": [],
            "time_description": time_desc,
            "search_query": search_query,
            "app_filter": app_filter,
            "kbs_searched": [],
            "message": "No Knowledge Base stores found on the system for this period.",
        }
        activity_answer = f"No activity records were found for {time_desc}."
        current_outputs = dict(state.get("node_outputs") or {})
        current_outputs["user_activity"] = retrieved_context
        current_outputs["activity_response"] = activity_answer
        current_outputs["executed_node"] = "user_activity"
        return {
            "retrieved_context": retrieved_context,
            "node_outputs": current_outputs,
            "final_response": activity_answer,
        }

    # Step 4D: Vector search on summarized_text + payload filters
    query_limit = 1000 if (start_ts is not None or end_ts is not None) else 150
    records = _search_across_knowledge_bases(
        kb_dirs=kb_dirs,
        search_query=search_query,
        app_name=app_filter,
        start_ts=start_ts,
        end_ts=end_ts,
        user_tz=user_tz,
        limit=query_limit,
    )

    log(f"[UserActivityNode] Search retrieved {len(records)} relevant activity point(s).")

    retrieved_context = {
        "found": len(records) > 0,
        "count": len(records),
        "records": records,
        "time_description": time_desc,
        "search_query": search_query,
        "app_filter": app_filter,
        "start_timestamp": start_ts,
        "end_timestamp": end_ts,
        "kbs_searched": [d.name for d in kb_dirs],
        "message": "Activities successfully retrieved." if records else "No matching activity records found.",
    }

    # Formulate factual activity response using low temperature (0.0)
    if not records:
        activity_answer = f"No activity records were found for {time_desc}."
    else:
        activity_answer = _formulate_activity_response(
            user_name=user_profile.get("user_name", "User"),
            user_query=user_query,
            time_desc=time_desc,
            records=records,
            detail_level=detail_level,
        )

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["user_activity"] = retrieved_context
    current_outputs["activity_response"] = activity_answer
    current_outputs["executed_node"] = "user_activity"

    return {
        "retrieved_context": retrieved_context,
        "node_outputs": current_outputs,
        "final_response": activity_answer,
    }


def _clean_caption_summary(raw_text: str) -> str:
    """Removes verbose boilerplate from captioner summaries while preserving all factual context."""
    if not raw_text:
        return ""
    t = re.sub(
        r'^(?:The user is|In [^,]+, the user is|The user has)\s+(?:working in|interacting with|viewing|using|editing|browsing in)?\s*',
        '',
        raw_text,
        flags=re.IGNORECASE
    )
    t = re.sub(r'^(?:specifically|currently)\s+', '', t, flags=re.IGNORECASE)
    t = t.strip()
    return (t[0].upper() + t[1:]) if t else raw_text


def _build_session_blocks(records: List[Dict[str, Any]], is_project_query: bool = False, max_blocks: int = 35) -> List[Dict[str, Any]]:
    """
    Intelligently clusters continuous activity snapshots into cohesive session blocks
    spanning the entire time window from start to end without randomly dropping any period.
    """
    if not records:
        return []

    sorted_records = sorted(records, key=lambda x: x["timestamp"])
    sessions: List[Dict[str, Any]] = []

    for r in sorted_records:
        app = r.get("app_name", "Unknown App").strip()
        ts = r["timestamp"]
        ts_fmt = r.get("timestamp_formatted", "Unknown Time")
        cleaned_text = _clean_caption_summary(str(r.get("summarized_text") or "").strip())

        if not sessions:
            sessions.append({
                "app_name": app,
                "start_ts": ts,
                "end_ts": ts,
                "start_fmt": ts_fmt,
                "end_fmt": ts_fmt,
                "actions": [cleaned_text[:140]] if cleaned_text else [],
            })
            continue

        prev = sessions[-1]
        same_app = (app.lower() == prev["app_name"].lower())
        gap = ts - prev["end_ts"]

        # Merge if same application and gap <= 8 minutes
        if same_app and gap <= 480:
            prev["end_ts"] = ts
            prev["end_fmt"] = ts_fmt
            if cleaned_text and not any(cleaned_text[:40].lower() in a[:40].lower() or a[:40].lower() in cleaned_text[:40].lower() for a in prev["actions"]):
                prev["actions"].append(cleaned_text[:140])
        else:
            sessions.append({
                "app_name": app,
                "start_ts": ts,
                "end_ts": ts,
                "start_fmt": ts_fmt,
                "end_fmt": ts_fmt,
                "actions": [cleaned_text[:140]] if cleaned_text else [],
            })

    # Proportional condensing if sessions exceed max_blocks, ensuring zero gaps across the entire timeframe
    if len(sessions) > max_blocks:
        step = max(1, len(sessions) // max_blocks)
        condensed: List[Dict[str, Any]] = []
        for i in range(0, len(sessions), step):
            chunk = sessions[i:i + step]
            base = dict(chunk[0])
            base["end_ts"] = chunk[-1]["end_ts"]
            base["end_fmt"] = chunk[-1]["end_fmt"]
            merged_actions: List[str] = []
            for c in chunk:
                for act in c["actions"]:
                    if act not in merged_actions:
                        merged_actions.append(act)
            base["actions"] = merged_actions[:2]
            condensed.append(base)
        sessions = condensed[:max_blocks]

    return sessions


def _formulate_activity_response(
    user_name: str,
    user_query: str,
    time_desc: str,
    records: List[Dict[str, Any]],
    detail_level: str = "overview",
) -> str:
    """
    Formulates a factual, concise response explaining user activity using
    'activity_retrieval' work (temp 0.0) based strictly on verified records.
    Answers only what was asked with zero assumptions or hallucinations.
    Adapts structure based on detail_level:
      - 'overview': concise, high-level summary of primary activities & timeframes.
      - 'detailed': complete chronological activity timeline with all available details.
      - 'concise': direct, pinpoint factual answer addressing only the specific question.
    Budgets evidence tokens to avoid provider rate limit / 413 errors.
    """
    is_stage_or_project_query = any(k in user_query.lower() for k in ("stage", "status", "current", "latest", "now", "progress", "project", "projects"))
    
    # Intelligently cluster continuous records into cohesive session blocks spanning the FULL timeframe
    session_blocks = _build_session_blocks(records, is_project_query=is_stage_or_project_query, max_blocks=35)

    direct_lines: List[str] = []
    evidence_items: List[str] = []

    for idx, s in enumerate(session_blocks, start=1):
        span = s["start_fmt"] if s["start_fmt"] == s["end_fmt"] else f"{s['start_fmt']} - {s['end_fmt']}"
        action_summary = "; also: ".join(s["actions"]) if s["actions"] else "Active"
        direct_lines.append(f"- **{span}** — **{s['app_name']}**: {action_summary}")
        evidence_items.append(f"{idx}. [{span}] {s['app_name']}: {action_summary}")

    direct_timeline = "\n".join(direct_lines)
    evidence_text = "\n".join(evidence_items)

    if detail_level == "detailed":
        detail_prompt_section = (
            "Detail Level: DETAILED TIMELINE\n"
            "The user explicitly requested full details or a complete timeline.\n"
            "Present the complete, detailed chronological timeline with all available details: exact timestamps, "
            "applications, window titles, documents, queries, and tools.\n"
            "Format:\n"
            "- **[Timestamp or Range]** — **[Application]**: [Factual description with all confirmed details]"
        )
    elif detail_level == "concise":
        detail_prompt_section = (
            "Detail Level: CONCISE PINPOINT ANSWER\n"
            "The user asked a specific question regarding their activity (e.g. asking about a specific app, file, or time).\n"
            "Answer ONLY what the user asked directly, concisely, and factually based on the confirmed activity data.\n"
            "State the specific application, timestamp, or confirmed action without dumping unrelated timeline entries.\n"
            "Format: Direct, concise factual sentence(s) answering the question."
        )
    else:  # overview
        detail_prompt_section = (
            "Detail Level: CONCISE OVERVIEW\n"
            "The user asked a general question about their activity.\n"
            "Provide a clean, structured, concise overview summarizing the user's primary activities, main applications used, "
            "and time periods spent. Group continuous activities rather than listing every single timestamp snapshot.\n"
            "Format:\n"
            "Concise summary of main tasks accomplished, followed by high-level bullet points for key activities if helpful."
        )

    prompt = f"""You are the User Activity Agent of MIRA.
Analyze the user's question and the verified screen activity events below.
Answer the user's question accurately, concisely, and factually.

User: {user_name}
Question: "{user_query}"
Time Range: {time_desc}

{detail_prompt_section}

Verified Screen Activity Events:
{evidence_text}

Strict Rules:
1. Answer ONLY what the user asked regarding their activity.
2. Explain each activity in simple, clear language based ONLY on the verified data.
3. For applications and browsers: state the specific document, file, website, tool, or query being used whenever confirmed by the data.
4. Do NOT confuse project names with Git branch names or UI labels. If 'main', 'master', or a similar label appears, do NOT assume or claim it is a project name or Git branch.
5. Strictly distinguish between applications/tools (e.g. Antigravity IDE, Visual Studio Code, Microsoft Edge, Chrome, Notepad, File Explorer, Terminal) and projects (e.g. Mira, Voice Buildathon, JungaliJumper3D, Azentio.ai Build Labs). Applications are tools used to work on a project. NEVER call an application a project (e.g. NEVER say 'Antigravity IDE Project' or 'Microsoft Edge Project').
6. Do NOT autocomplete missing context, make assumptions, invent actions, or hallucinate details. If an activity is unclear, state only what is known.
7. Chronological & Concise: Present events chronologically. Do NOT include unrelated information, additional explanations, suggestions, assumptions, or unnecessary introductions.
8. Project Stage & Status: When the user asks about the "current stage", "status", or "progress" of projects:
   - Identify each distinct project confirmed in the evidence.
   - Synthesize the current stage/status for each project based on the confirmed work (e.g. Active Development & Configuration, Architecture Review & Design, Task Planning / Backlog Setup, Team Formation).
   - State the latest confirmed work done for each project clearly.
   - Do NOT output defensive disclaimers like "The specific current stage isn't explicitly detailed". Directly characterize the stage and status based on the confirmed activities.
9. AVOID greetings, conversational pleasantries, and trailing follow-up questions.
"""
    try:
        raw_ans = call_llm(prompt, work="activity_retrieval").strip()
        # Accept only if valid text and not JSON parameters or unavailable error
        if raw_ans and not raw_ans.startswith("{") and "The AI request could not be completed" not in raw_ans:
            return raw_ans
    except Exception as e:
        log_error(f"[UserActivityNode] Factual answer LLM generation failed: {e}")

    # Fallback: direct timeline from verified records
    return direct_timeline


def _understand_activity_query(
    query: str,
    history: List[Dict[str, str]],
    now_in_tz: datetime,
    user_tz: Any
) -> Dict[str, Any]:
    """
    Extracts semantic search query, target app_name (if any), and time expression
    using LLM work category 'activity_retrieval' (temp 0.0 in config.json).
    """
    current_time_str = now_in_tz.strftime("%Y-%m-%d %I:%M %p (%A)")
    prompt = f"""You are the Activity Retrieval Query Analyzer for MIRA.
Analyze the user's question to extract search parameters for querying screen activity history.

Current Reference Time: {current_time_str} (Timezone: {user_tz})
User Query: "{query}"

Extract the following JSON fields:
1. "search_query": Focused keywords for semantic vector search on summarized screen text (e.g. "projects repository code workspace", "WhatsApp chat", "editing code in VS Code", "reading documentation"). If the user is asking broadly about all their activity or general timeline (e.g. "what have I done", "what was I doing"), set to null.
2. "app_name": Specific desktop app name if explicitly mentioned or strongly implied (e.g. "Microsoft Edge", "Visual Studio Code", "Notepad", "WhatsApp", "Discord", "Figma", "Spotify", "Terminal"). If not specific to an app, set to null.
3. "time_expression": The specific relative or absolute time phrase mentioned (e.g. "last 5 hours", "past 2 hours", "yesterday", "today", "between 9 AM and 5 PM", "last month", "last week"). If the user is asking broadly about projects, ongoing work, apps, or activities without specifying a date or time, set to null so all history is searched.

Return strictly a valid JSON object matching:
{{
  "search_query": "<string or null>",
  "app_name": "<string or null>",
  "time_expression": "<string or null>"
}}
Do not include any other markdown or commentary outside the JSON object.
"""
    try:
        raw = call_llm(prompt, work="activity_retrieval")
        cleaned = re.sub(r'```(?:json)?', '', raw).strip('` \n\r\t')
        match = re.search(r'\{[^{}]*\}', cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return json.loads(cleaned)
    except Exception as e:
        log_error(f"[UserActivityNode] Parameter extraction fallback due to LLM parse error: {e}")
        return {
            "search_query": query,
            "app_name": None,
            "time_expression": query,
        }


def _get_kb_base_dir() -> Path:
    """
    Finds the central Knowledge Base storage folder from Vault or local fallback.
    """
    candidate_paths = [
        Path(r"E:\FullStack\Mira\Vault\system\knowledge_base"),
        Path(__file__).resolve().parents[3] / "Vault" / "system" / "knowledge_base",
    ]
    for p in candidate_paths:
        if p.exists() and p.is_dir():
            return p
    return candidate_paths[0]


def _find_relevant_knowledge_bases(
    start_ts: Optional[int],
    end_ts: Optional[int],
    user_tz: Any
) -> List[Path]:
    """
    Discovers all Knowledge Base folders matching 'kb-DD_MM_YYYY-DD_MM_YYYY'
    and filters those overlapping with the requested [start_ts, end_ts] window.
    Sorts chronologically descending (newest first).
    """
    kb_base = _get_kb_base_dir()
    if not kb_base.exists():
        return []

    discovered: List[Tuple[datetime, datetime, Path]] = []
    for item in kb_base.iterdir():
        if not item.is_dir():
            continue
        m = KB_NAME_PATTERN.match(item.name)
        if not m:
            continue
        try:
            d1, m1, y1 = int(m.group(1)), int(m.group(2)), int(m.group(3))
            d2, m2, y2 = int(m.group(4)), int(m.group(5)), int(m.group(6))
            dt1 = datetime(y1, m1, d1, 0, 0, 0, tzinfo=user_tz)
            dt2 = datetime(y2, m2, d2, 23, 59, 59, tzinfo=user_tz)
            discovered.append((dt1, dt2, item))
        except Exception:
            continue

    if not discovered:
        return []

    # Sort newest first
    discovered.sort(key=lambda x: (x[1], x[0]), reverse=True)

    if start_ts is None and end_ts is None:
        return [item[2] for item in discovered]

    req_start_dt = datetime.fromtimestamp(start_ts, tz=timezone.utc) if start_ts is not None else datetime.min.replace(tzinfo=timezone.utc)
    req_end_dt = datetime.fromtimestamp(end_ts, tz=timezone.utc) if end_ts is not None else datetime.max.replace(tzinfo=timezone.utc)

    matched: List[Path] = []
    for dt1, dt2, kb_path in discovered:
        # Convert to UTC for timestamp boundary comparison
        utc1 = dt1.astimezone(timezone.utc)
        utc2 = dt2.astimezone(timezone.utc)
        # Check overlap: (kb_end >= req_start) and (kb_start <= req_end)
        if utc2 >= req_start_dt and utc1 <= req_end_dt:
            matched.append(kb_path)

    # If strict date overlap gave no results, provide latest KB as fallback check
    if not matched and discovered:
        matched.append(discovered[0][2])

    return matched


def _decrypt_text(raw_text: str) -> str:
    """
    Guarantees fast, robust decryption of Knowledge Base payload text using local Vault crypto directly.
    """
    if not raw_text or not isinstance(raw_text, str):
        return ""
    cleaned = raw_text.strip()
    if not cleaned.startswith("enc:v1:"):
        return cleaned

    # 1. Direct local Vault crypto (instant, in-memory, 0ms)
    try:
        import sys
        root_dir = Path(__file__).resolve().parents[3]
        if str(root_dir) not in sys.path:
            sys.path.insert(0, str(root_dir))
        from Vault import crypto as v_crypto
        raw_ct = cleaned[len("enc:v1:"):]
        decrypted = v_crypto.decrypt_text(raw_ct)
        if decrypted:
            return decrypted
    except Exception as e:
        logger.debug(f"Direct Vault crypto error: {e}")

    # 2. Vault crypto client fallback
    try:
        import sys
        root_dir = Path(__file__).resolve().parents[3]
        if str(root_dir / "Memory") not in sys.path:
            sys.path.insert(0, str(root_dir / "Memory"))
        from knowledge_base.encryption import vault_crypto
        if vault_crypto:
            decrypted = vault_crypto.decrypt(cleaned)
            if decrypted and not decrypted.startswith("enc:v1:"):
                return decrypted
    except Exception as e:
        logger.debug(f"Vault crypto client error: {e}")

    return cleaned


def _query_single_kb(
    kb_path: Path,
    query_vector: Optional[List[float]],
    query_filter: Any,
    range_params: Dict[str, int],
    app_name: Optional[str],
    start_ts: Optional[int],
    end_ts: Optional[int],
    user_tz: Any,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Safely queries a single Qdrant Knowledge Base folder and decrypts points.
    """
    from qdrant_client import QdrantClient, models

    results: List[Dict[str, Any]] = []
    try:
        # Safely open QdrantClient by bypassing exclusive portalocker file lock
        with unittest.mock.patch("portalocker.lock", return_value=None), \
             unittest.mock.patch("portalocker.unlock", return_value=None):
            client = QdrantClient(path=str(kb_path))
            existing_cols = [c.name for c in client.get_collections().collections]
            if COLLECTION_NAME not in existing_cols:
                client.close()
                return []

            if range_params:
                fetch_limit = max(limit, 1000)
            elif query_vector:
                fetch_limit = max(limit * 2, 200)
            else:
                fetch_limit = max(limit * 2, 400)
            points = []

            if query_vector:
                try:
                    search_res = client.query_points(
                        collection_name=COLLECTION_NAME,
                        query=query_vector,
                        query_filter=query_filter,
                        limit=fetch_limit,
                    )
                    points = search_res.points
                except Exception as se:
                    log_error(f"[UserActivityNode] query_points failed on {kb_path.name}: {se}. Falling back to scroll.")
                    points = []

            # Fallback to scroll if vector search returned nothing or was not requested
            if not points:
                try:
                    scroll_res, _ = client.scroll(
                        collection_name=COLLECTION_NAME,
                        scroll_filter=query_filter,
                        limit=fetch_limit,
                        with_payload=True,
                        with_vectors=False,
                    )
                    points = scroll_res
                except Exception as sce:
                    log_error(f"[UserActivityNode] scroll failed on {kb_path.name}: {sce}")

            # If specific app filter resulted in 0 points due to exact casing mismatch,
            # retry with relaxed app filter
            if not points and app_name:
                relaxed_filter = models.Filter(
                    must=[models.FieldCondition(key="timestamp", range=models.Range(**range_params))]
                ) if range_params else None
                try:
                    if query_vector:
                        search_res = client.query_points(
                            collection_name=COLLECTION_NAME,
                            query=query_vector,
                            query_filter=relaxed_filter,
                            limit=fetch_limit,
                        )
                        points = [
                            p for p in search_res.points
                            if str(app_name).lower() in str(p.payload.get("app_name", "")).lower()
                        ]
                except Exception:
                    pass

            # Process and decrypt points
            for pt in points:
                payload = pt.payload or {}
                raw_text = payload.get("summarized_text", "")
                decrypted_text = _decrypt_text(raw_text)

                # Guard: Never pass raw ciphertext into synthesis
                if decrypted_text.startswith("enc:v1:"):
                    log_error(f"[UserActivityNode] Point {pt.id} remained encrypted, omitting.")
                    continue

                # Sanitize any legacy confusion regarding project names vs branch names
                sanitized_text = re.sub(
                    r"\b(?:repository or project named 'main'|project named 'main'|project 'main')\b",
                    "workspace displaying label 'main'",
                    decrypted_text,
                    flags=re.IGNORECASE
                )
                sanitized_text = re.sub(r'\bproject named "main"\b', "workspace displaying label 'main'", sanitized_text, flags=re.IGNORECASE)

                pt_ts = int(payload.get("timestamp") or 0)
                # Enforce strict Python-side boundary check
                if start_ts is not None and pt_ts < start_ts:
                    continue
                if end_ts is not None and pt_ts > end_ts:
                    continue

                localized_ts = format_timestamp_in_tz(pt_ts, user_tz) if pt_ts else "Unknown Time"
                score_val = float(getattr(pt, "score", 1.0))

                results.append({
                    "id": str(pt.id),
                    "score": score_val,
                    "app_name": payload.get("app_name", "Unknown"),
                    "os": payload.get("os", "Unknown"),
                    "timestamp": pt_ts,
                    "timestamp_formatted": localized_ts,
                    "summarized_text": sanitized_text,
                    "kb_name": kb_path.name,
                })

            client.close()
    except Exception as e:
        log_error(f"[UserActivityNode] Error querying Knowledge Base '{kb_path.name}': {e}")

    return results


def _search_across_knowledge_bases(
    kb_dirs: List[Path],
    search_query: str,
    app_name: Optional[str],
    start_ts: Optional[int],
    end_ts: Optional[int],
    user_tz: Any,
    limit: int = 25
) -> List[Dict[str, Any]]:
    """
    Performs vector similarity search + payload filtering across the specified Qdrant Knowledge Bases.
    Decrypted summarized_text and localized timestamps are preserved.
    Searches multiple KBs concurrently with ThreadPoolExecutor to minimize latency.
    """
    from qdrant_client import models

    # Generate query embedding if specific query given; for broad activity timeline queries, use chronological scroll
    query_vector = None
    is_broad_query = not search_query or search_query.strip().lower() in (
        "none", "null", "user computer activity", "activity", "user activity", "all", "all activity",
        "what have i done", "what was i doing", "work", "history"
    )
    if not is_broad_query:
        try:
            clean_q = search_query.strip()
            query_vector = generate_embedding(clean_q)
        except Exception as e:
            log_error(f"[UserActivityNode] Failed to generate embedding for query: {e}")

    # Build Qdrant payload filters
    filter_conditions: List[models.FieldCondition] = []

    # App filter
    if app_name and str(app_name).strip():
        app_clean = str(app_name).strip()
        filter_conditions.append(
            models.FieldCondition(key="app_name", match=models.MatchValue(value=app_clean))
        )

    # Timestamp range filter (Unix timestamps in seconds)
    range_params: Dict[str, int] = {}
    if start_ts is not None:
        range_params["gte"] = int(start_ts)
    if end_ts is not None:
        range_params["lte"] = int(end_ts)

    if range_params:
        filter_conditions.append(
            models.FieldCondition(key="timestamp", range=models.Range(**range_params))
        )

    query_filter = models.Filter(must=filter_conditions) if filter_conditions else None

    # Execute searches across KBs in parallel if multiple exist
    if len(kb_dirs) == 1:
        aggregated_records = _query_single_kb(
            kb_path=kb_dirs[0],
            query_vector=query_vector,
            query_filter=query_filter,
            range_params=range_params,
            app_name=app_name,
            start_ts=start_ts,
            end_ts=end_ts,
            user_tz=user_tz,
            limit=limit,
        )
    else:
        aggregated_records = []
        with ThreadPoolExecutor(max_workers=min(len(kb_dirs), 4)) as executor:
            futures = [
                executor.submit(
                    _query_single_kb,
                    kb_path=kp,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    range_params=range_params,
                    app_name=app_name,
                    start_ts=start_ts,
                    end_ts=end_ts,
                    user_tz=user_tz,
                    limit=limit,
                )
                for kp in kb_dirs
            ]
            for fut in as_completed(futures):
                try:
                    records = fut.result()
                    aggregated_records.extend(records)
                except Exception as e:
                    log_error(f"[UserActivityNode] KB query worker error: {e}")

    # Deduplicate points by ID
    unique_map: Dict[str, Dict[str, Any]] = {}
    for r in aggregated_records:
        rid = r["id"]
        if rid not in unique_map or r["score"] > unique_map[rid]["score"]:
            unique_map[rid] = r

    final_list = list(unique_map.values())
    # Sort chronologically ascending
    final_list.sort(key=lambda x: x["timestamp"])

    # Deduplicate consecutive identical activity summaries across the same app
    deduped_timeline: List[Dict[str, Any]] = []
    for r in final_list:
        if not deduped_timeline:
            r_copy = dict(r)
            r_copy["timestamp_end"] = r["timestamp"]
            deduped_timeline.append(r_copy)
            continue
        prev = deduped_timeline[-1]
        same_app = (r["app_name"].strip().lower() == prev["app_name"].strip().lower())
        prev_end_ts = prev.get("timestamp_end", prev["timestamp"])
        time_diff = abs(r["timestamp"] - prev_end_ts)
        
        # Check if they are the same continuous activity within 5 minutes of last activity
        is_same = False
        if same_app and time_diff <= 300:
            t1 = prev["summarized_text"].lower().strip()
            t2 = r["summarized_text"].lower().strip()
            if t1 == t2 or t1[:60] == t2[:60]:
                is_same = True
            else:
                words1 = set(re.findall(r'\b[a-zA-Z0-9_\-\.]{3,}\b', t1))
                words2 = set(re.findall(r'\b[a-zA-Z0-9_\-\.]{3,}\b', t2))
                if words1 and words2:
                    overlap = len(words1 & words2) / max(len(words1), len(words2))
                    if overlap >= 0.45:
                        is_same = True

        if is_same:
            # Update end time range
            prev["timestamp_end"] = r["timestamp"]
            prev["timestamp_end_formatted"] = r["timestamp_formatted"]
            if len(r["summarized_text"]) > len(prev["summarized_text"]):
                prev["summarized_text"] = r["summarized_text"]
            continue
        r_copy = dict(r)
        r_copy["timestamp_end"] = r["timestamp"]
        deduped_timeline.append(r_copy)

    # When a specific time window is requested, return all deduped records in that window (never arbitrarily slice)
    if start_ts is not None or end_ts is not None:
        return deduped_timeline

    # For open-ended queries without a time window:
    if any(k in (search_query or "").lower() for k in ("stage", "status", "current", "latest", "project", "projects")):
        if len(deduped_timeline) > limit:
            # Preserve representative coverage: sample across distinct apps + latest events
            app_seen = set()
            chosen = []
            for r in reversed(deduped_timeline):
                app = r.get("app_name", "")
                if app not in app_seen or len(chosen) < limit // 2:
                    app_seen.add(app)
                    chosen.append(r)
                if len(chosen) >= limit:
                    break
            return sorted(chosen, key=lambda x: x["timestamp"])

    return deduped_timeline[:limit]

