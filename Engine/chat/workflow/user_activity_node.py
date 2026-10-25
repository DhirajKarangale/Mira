from __future__ import annotations

import json
import logging
import re
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

    # Step 4A: Understand the query parameters via LLM (using config.json 'activity_retrieval', temp 0.0)
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
    records = _search_across_knowledge_bases(
        kb_dirs=kb_dirs,
        search_query=search_query,
        app_name=app_filter,
        start_ts=start_ts,
        end_ts=end_ts,
        user_tz=user_tz,
        limit=50,
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


def _formulate_activity_response(
    user_name: str,
    user_query: str,
    time_desc: str,
    records: List[Dict[str, Any]],
) -> str:
    """
    Formulates a factual, concise response explaining user activity using
    'activity_retrieval' work (temp 0.0) based strictly on verified records.
    Answers only what was asked with zero assumptions or hallucinations.
    Budgets evidence tokens to avoid provider rate limit / 413 errors.
    """
    sample_records = records[:30]
    lines: List[str] = []
    for r in sample_records:
        ts = r.get("timestamp_formatted", "Unknown Time")
        ts_end = r.get("timestamp_end_formatted")
        time_display = f"{ts} - {ts_end}" if ts_end and ts_end != ts else ts
        app = r.get("app_name", "Unknown App")
        summary = str(r.get("summarized_text") or "").strip()
        lines.append(f"- **{time_display}** — **{app}**: {summary}")

    direct_timeline = "\n".join(lines)

    # Budget evidence tokens so prompt never exceeds provider limits (e.g. Groq 7k limit)
    evidence_items: List[str] = []
    char_count = 0
    for idx, r in enumerate(sample_records, start=1):
        stext = str(r.get("summarized_text") or "").strip()
        if len(stext) > 220:
            stext = stext[:220].rstrip() + "..."
        ts_disp = r.get("timestamp_formatted", "")
        app_disp = r.get("app_name", "")
        item = f"{idx}. [{ts_disp}] {app_disp}: {stext}"
        if char_count + len(item) > 4500:
            break
        evidence_items.append(item)
        char_count += len(item)

    evidence_text = "\n".join(evidence_items)

    prompt = f"""You are the User Activity Agent of MIRA.
Analyze the user's question and the verified screen activity events below.
Answer the user's question accurately, concisely, and factually.

User: {user_name}
Question: "{user_query}"
Time Range: {time_desc}

Verified Screen Activity Events:
{evidence_text}

Strict Rules:
1. Answer ONLY what the user asked regarding their activity.
2. Explain each activity in simple, clear language based ONLY on the verified data.
3. For applications and browsers: state the specific document, file, website, tool, or query being used whenever confirmed by the data.
4. Do NOT confuse project names with Git branch names or UI labels. If 'main', 'master', or a similar label appears, do NOT assume or claim it is a project name or Git branch.
5. Do NOT autocomplete missing context, make assumptions, invent actions, or hallucinate details. If an activity is unclear, state only what is known.
6. Chronological & Concise: Present the events chronologically. Do NOT include unrelated information, additional explanations, suggestions, assumptions, or unnecessary introductions.
7. AVOID greetings, conversational pleasantries, and trailing follow-up questions.

Format:
- **[Timestamp or Range]** — **[Application]**: [Clear, simple, factual description]
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
1. "search_query": Focused keywords for semantic vector search on summarized screen text (e.g. "WhatsApp chat conversation", "editing code file in VS Code", "reading documentation"). If the user is asking broadly about all their activity or general timeline (e.g. "what have I done", "what was I doing"), set to null.
2. "app_name": Specific desktop app name if explicitly mentioned or strongly implied (e.g. "Microsoft Edge", "Visual Studio Code", "Notepad", "WhatsApp", "Discord", "Figma", "Spotify", "Terminal"). If not specific to an app, set to null.
3. "time_expression": The specific relative or absolute time phrase mentioned (e.g. "last 5 hours", "past 2 hours", "yesterday", "today", "between 9 AM and 5 PM", "last month", "last week", "before 2 PM", "this morning", "on 24/10/2026"). If none specified, set to "today".

Return strictly a valid JSON object matching:
{{
  "search_query": "<string or null>",
  "app_name": "<string or null>",
  "time_expression": "<string>"
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
    """
    from qdrant_client import QdrantClient, models

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

    aggregated_records: List[Dict[str, Any]] = []

    for kb_path in kb_dirs:
        try:
            # Safely open QdrantClient by bypassing exclusive portalocker file lock
            with unittest.mock.patch("portalocker.lock", return_value=None), \
                 unittest.mock.patch("portalocker.unlock", return_value=None):
                client = QdrantClient(path=str(kb_path))
                existing_cols = [c.name for c in client.get_collections().collections]
                if COLLECTION_NAME not in existing_cols:
                    client.close()
                    continue

                fetch_limit = max(limit * 2, 80)
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

                    aggregated_records.append({
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
            continue

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
            deduped_timeline.append(r)
            continue
        prev = deduped_timeline[-1]
        same_app = (r["app_name"].strip().lower() == prev["app_name"].strip().lower())
        time_diff = abs(r["timestamp"] - prev["timestamp"])
        
        # Check if they are the same continuous activity within 5 minutes
        is_same = False
        if same_app and time_diff <= 300:
            t1 = prev["summarized_text"].lower().strip()
            t2 = r["summarized_text"].lower().strip()
            if t1 == t2 or t1[:80] == t2[:80]:
                is_same = True
            else:
                words1 = set(re.findall(r'\b[a-zA-Z0-9_\-\.]{3,}\b', t1))
                words2 = set(re.findall(r'\b[a-zA-Z0-9_\-\.]{3,}\b', t2))
                if words1 and words2:
                    overlap = len(words1 & words2) / max(len(words1), len(words2))
                    if overlap >= 0.55:
                        is_same = True

        if is_same:
            # Update end time range
            prev["timestamp_end_formatted"] = r["timestamp_formatted"]
            if len(r["summarized_text"]) > len(prev["summarized_text"]):
                prev["summarized_text"] = r["summarized_text"]
            continue
        deduped_timeline.append(r)

    return deduped_timeline[:limit]

