from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.user_knowledge_base.extractor")

JSON_REGEX = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)


def _clean_json_text(text: str) -> str:
    """
    Extract the raw JSON string from an LLM response that might be enclosed in markdown blocks.
    """
    m = JSON_REGEX.search(text)
    if m:
        return m.group(1).strip()
    clean = text.strip()
    if clean.startswith("{") and clean.endswith("}"):
        return clean
    # Search for the outermost JSON braces
    start = clean.find("{")
    end = clean.rfind("}")
    if start != -1 and end != -1 and end > start:
        return clean[start : end + 1]
    return clean


def format_jobs_batch_for_prompt(jobs: List[Dict[str, Any]]) -> str:
    """
    Format a batch of up to 10 jobs into a readable, numbered context string for the LLM.
    """
    lines: List[str] = []
    for idx, j in enumerate(jobs, start=1):
        app = str(j.get("app_name") or "Unknown Application").strip()
        os_name = str(j.get("os") or "Unknown OS").strip()
        raw_ts = j.get("timestamp")
        time_str = "Unknown Time"
        if raw_ts:
            try:
                dt = datetime.fromtimestamp(float(raw_ts), tz=timezone.utc)
                time_str = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
            except Exception:
                time_str = str(raw_ts)

        raw_text = str(j.get("extracted_text") or "").strip()
        # Truncate overly long text per job to stay within reasonable context window
        if len(raw_text) > 3000:
            raw_text = raw_text[:3000] + "\n... [truncated]"

        lines.append(f"--- SNAPSHOT {idx} ---")
        lines.append(f"Application: {app}")
        lines.append(f"OS: {os_name}")
        lines.append(f"Timestamp: {time_str}")
        lines.append(f"Captured Screen Content:\n{raw_text}")
        lines.append("")

    return "\n".join(lines)


def extract_user_info_from_batch(jobs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Send a batch of up to 10 jobs to the LLM to extract relevant user information,
    preferences, music, viewing, sports, and activities.
    """
    if not jobs:
        return {
            "preferences": [],
            "music_preferences": [],
            "viewing_interests": [],
            "sports_interests": [],
            "life_and_activities": [],
        }

    # Filter out empty or whitespace-only jobs
    jobs_with_content = [
        j for j in jobs if str(j.get("extracted_text") or "").strip()
    ]

    if not jobs_with_content:
        log(f"[UserKnowledgeBase] All {len(jobs)} jobs in batch contain empty text. Skipping LLM call.")
        return {
            "preferences": [],
            "music_preferences": [],
            "viewing_interests": [],
            "sports_interests": [],
            "life_and_activities": [],
        }

    batch_context = format_jobs_batch_for_prompt(jobs_with_content)

    prompt = f"""You are MIRA's User Profile & Preference Extraction Engine.
Analyze the following digital activity snapshots to identify persistent personal facts about the USER as an individual:
1. Likings: Tools, technologies, food, hobbies, styles, themes, and habits the user clearly likes, loves, or prefers.
2. Hateings / Dislikes: Things the user explicitly hates, dislikes, avoids, complains about, or rejects (e.g., dislikes light theme, hates unformatted code, hates ads, dislikes specific languages/tools).
3. Music Tastes: Favorite artists, bands, genres, or music platforms.
4. Viewing Interests: Favorite movies, anime, channels, or TV series the user follows.
5. Sports & Athletes: Sports, teams, or players the user actively follows or supports.

CRITICAL NEGATIVE CONSTRAINTS:
- DO NOT EXTRACT ROUTINE ACTIVITIES: "Browsing files in explorer", "writing python code", "opened terminal", "clicked a button", "running tests", or "viewing a website" ARE ACTIVITIES, NOT USER PREFERENCES. The Activity Knowledge Base already tracks activities. DO NOT EXTRACT ACTIVITIES HERE!
- ONLY extract genuine personal preferences (likes & dislikes), persistent tastes, or explicit personal facts about the user.
- If the snapshots show only routine desktop actions, code editing, browsing, or file operations without personal preference signals, return EMPTY arrays for all fields. It is normal and expected to return empty arrays most of the time!
- 'preference_type' MUST be either 'like' (likes/loves/favors) or 'dislike' (hates/dislikes/avoids).
- Keep item names clean and concise (e.g. 'Dark Mode', 'Python', 'Queen', 'Cold Brew', 'Light Mode', 'Spam Emails').
- Details must be concise (under 60 characters) explaining why or how they like/hate it.
- Return ONLY a single valid JSON object.

REQUIRED JSON FORMAT:
{{
  "preferences": [
    {{
      "category": "tech | food | lifestyle | gaming | work_style | general",
      "item": "Name of preference (e.g. 'Dark Mode', 'Light Mode', 'Docker', 'Vim Keybindings')",
      "preference_type": "like | dislike",
      "confidence": "explicit_fact | inference",
      "details": "Concise reason or context (under 60 chars)",
      "platform": "App or website name"
    }}
  ],
  "music_preferences": [
    {{
      "genre": "Genre name or null",
      "artist": "Artist or band name or null",
      "track": "Track or song title or null",
      "platform": "Spotify | YouTube Music | Apple Music | other",
      "confidence": "explicit_fact | inference",
      "details": "Concise note (under 60 chars)"
    }}
  ],
  "viewing_interests": [
    {{
      "media_type": "movie | anime | youtube | tv_series | documentary | other",
      "title": "Title of movie/anime/channel",
      "platform": "YouTube | Netflix | Crunchyroll | other",
      "status": "current | completed | interested | past",
      "confidence": "explicit_fact | inference",
      "details": "Concise note (under 60 chars)"
    }}
  ],
  "sports_interests": [
    {{
      "sport_name": "cricket | football | tennis | f1 | other",
      "teams_or_players": "Specific team, player, or tournament (e.g. 'India, CSK, Virat Kohli')",
      "interest_level": "high | moderate | casual",
      "confidence": "explicit_fact | inference",
      "details": "Concise note (under 60 chars)"
    }}
  ]
}}

CAPTURED SNAPSHOTS BATCH:
{batch_context}
"""

    log(f"[UserKnowledgeBase] Calling LLM to extract user information from batch of {len(jobs_with_content)} jobs...")
    raw_response = call_llm(prompt, work="user_knowledge_base")
    if not raw_response or "could not be completed" in raw_response:
        # Fallback to 'extraction' work category
        log("[UserKnowledgeBase] Retrying LLM call with work='extraction'...")
        raw_response = call_llm(prompt, work="extraction")

    if not raw_response or "could not be completed" in raw_response:
        log_error("[UserKnowledgeBase] LLM call failed or returned empty response for batch.")
        return None

    cleaned_json = _clean_json_text(raw_response)
    try:
        parsed = json.loads(cleaned_json)
        if not isinstance(parsed, dict):
            log_error(f"[UserKnowledgeBase] LLM returned non-dict JSON: {type(parsed)}")
            return None

        raw_prefs = parsed.get("preferences", []) if isinstance(parsed.get("preferences"), list) else []
        sanitized_prefs: List[Dict[str, Any]] = []
        for p in raw_prefs:
            if not isinstance(p, dict) or not p.get("item"):
                continue
            pt = str(p.get("preference_type") or "like").strip().lower()
            p["preference_type"] = "dislike" if pt in ("dislike", "hate", "avoid", "dislikes", "hates") else "like"
            sanitized_prefs.append(p)

        result: Dict[str, List[Dict[str, Any]]] = {
            "preferences": sanitized_prefs,
            "music_preferences": parsed.get("music_preferences", []) if isinstance(parsed.get("music_preferences"), list) else [],
            "viewing_interests": parsed.get("viewing_interests", []) if isinstance(parsed.get("viewing_interests"), list) else [],
            "sports_interests": parsed.get("sports_interests", []) if isinstance(parsed.get("sports_interests"), list) else [],
        }

        total_extracted = sum(len(items) for items in result.values())
        log(f"[UserKnowledgeBase] Extracted {total_extracted} user facts/preferences (likes/dislikes) from batch of {len(jobs_with_content)} jobs.")
        return result
    except Exception as e:
        log_error(f"[UserKnowledgeBase] Failed to parse LLM extraction JSON: {e}\nRaw output: {raw_response[:300]}")
        return None
