from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Dict, List, Optional

from .vault_client import fetch_latest_daily_suggestions, save_daily_suggestions_data
from .config import DEFAULT_NEWS_INTERVAL_HOURS
from chat.workflow.news_tool import fetch_news_from_gnews
from chat.websocket import ws_manager
from config import get_user_profile
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.news_section")


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


def is_news_refresh_needed(
    record: Optional[Dict[str, Any]],
    interval_hours: float = DEFAULT_NEWS_INTERVAL_HOURS,
) -> bool:
    if not record:
        return True
    news_data = record.get("news")
    date_news = record.get("date_news")
    if not news_data or news_data == [] or news_data == "[]":
        return True
    if not date_news:
        return True
    dt = parse_timestamp(date_news)
    if not dt:
        return True
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta_seconds = (now - dt).total_seconds()
    return delta_seconds >= (interval_hours * 3600)


def select_top_three_stories_with_llm(
    articles: List[Dict[str, Any]],
    location_desc: str = "",
) -> List[Dict[str, Any]]:
    """
    Uses LLM to select the three most important, relevant, and distinct stories,
    generating a concise, factually accurate summary for each story.
    """
    if not articles:
        return []

    if len(articles) <= 3:
        # If 3 or fewer, still format nicely
        chosen = articles
    else:
        chosen = articles[:10]

    items_text: List[str] = []
    for idx, art in enumerate(chosen):
        title = art.get("title", "Untitled").strip()
        desc = art.get("description", "").strip()
        src = art.get("source", {}).get("name", "News")
        items_text.append(f"Story #{idx + 1}:\nTitle: {title}\nSource: {src}\nDescription: {desc}\nURL: {art.get('url', '')}\nPublishedAt: {art.get('publishedAt', '')}")

    combined = "\n\n".join(items_text)
    prompt = f"""You are MIRA's Lead News Editor.
Candidate news stories for {location_desc or 'today'}:
{combined}

Task:
Select the THREE most important, relevant, and distinct stories.
Requirements:
1. Ensure the stories cover different topics or events (no duplicate coverage).
2. For each story, provide a concise, factual summary (1-2 sentences) preserving complete factual accuracy.
3. Return strictly a JSON array of 3 objects in this format:
[
  {{
    "title": "Clean, engaging headline",
    "summary": "1-2 sentence concise factual summary.",
    "url": "original article URL",
    "source": "News source name",
    "published_at": "original publication timestamp"
  }}
]
Do not output any commentary outside the JSON array."""

    try:
        raw_resp = call_llm(prompt, work="summarization")
        cleaned = re.sub(r'```(?:json)?', '', raw_resp).strip('` \n\r\t')
        match = re.search(r'\[\s*\{.*\}\s*\]', cleaned, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list) and len(parsed) >= 1:
                result: List[Dict[str, Any]] = []
                for p in parsed[:3]:
                    result.append({
                        "title": str(p.get("title", "")).strip(),
                        "summary": str(p.get("summary", "")).strip(),
                        "url": str(p.get("url", "")).strip(),
                        "source": str(p.get("source", "News")).strip(),
                        "published_at": str(p.get("published_at", "")).strip(),
                    })
                if len(result) >= 1:
                    return result
    except Exception as e:
        log_error(f"[NewsSection] LLM story selection failed: {e}")

    # Deterministic fallback: pick top 3 unique articles
    fallback_stories: List[Dict[str, Any]] = []
    seen_titles = set()
    for art in articles:
        title = (art.get("title") or "").strip()
        if not title or title.lower() in seen_titles:
            continue
        seen_titles.add(title.lower())
        desc = (art.get("description") or art.get("content") or "").strip()
        # Truncate summary if too long
        if len(desc) > 220:
            desc = desc[:217] + "..."
        fallback_stories.append({
            "title": title,
            "summary": desc or "Click to read the full report.",
            "url": (art.get("url") or "").strip(),
            "source": art.get("source", {}).get("name", "News"),
            "published_at": (art.get("publishedAt") or "").strip(),
        })
        if len(fallback_stories) == 3:
            break

    return fallback_stories


async def refresh_news(force: bool = False) -> List[Dict[str, Any]]:
    """
    Executes News refresh:
      1. Checks daily_suggestions table.
      2. If not needed and not forced, returns current data.
      3. Retrieves user's country and city from Vault.
      4. Queries existing News Tool for relevant news.
      5. Selects top 3 distinct stories and generates concise summaries.
      6. Stores in news and date_news in Vault.
      7. Broadcasts updated news to frontend via WebSockets.
    """
    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)
    if not force and not is_news_refresh_needed(current_record):
        log("[NewsSection] News headlines are already up-to-date. Skipping refresh.")
        return current_record.get("news") or []

    log("[NewsSection] Initiating news headlines refresh...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("news", {"status": "refreshing"})
    except Exception:
        pass

    user_profile = await asyncio.to_thread(get_user_profile) or {}
    country = user_profile.get("country") or "us"
    city = user_profile.get("city") or ""

    location_desc = f"{city}, {country}" if city else country

    # 1. First attempt: Search by user's city if known
    raw_articles: List[Dict[str, Any]] = []
    if city:
        try:
            log(f"[NewsSection] Querying GNews for city '{city}' ({country})...")
            search_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="search",
                q=city,
                country=country,
                max_results=10,
            )
            if search_res.get("success") and search_res.get("articles"):
                raw_articles = search_res.get("articles", [])
        except Exception as e:
            logger.debug(f"[NewsSection] City search failed: {e}")

    # 2. Second attempt: Top headlines for user's country if city yielded fewer than 3
    if len(raw_articles) < 3:
        try:
            log(f"[NewsSection] Querying top headlines for country '{country}'...")
            headlines_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="top_headlines",
                country=country,
                max_results=10,
            )
            if headlines_res.get("success") and headlines_res.get("articles"):
                more_articles = headlines_res.get("articles", [])
                # Combine unique articles
                existing_urls = {a.get("url") for a in raw_articles if a.get("url")}
                for a in more_articles:
                    if a.get("url") not in existing_urls:
                        raw_articles.append(a)
        except Exception as e:
            logger.debug(f"[NewsSection] Country headlines failed: {e}")

    # 3. Third attempt: Global fallback if empty
    if len(raw_articles) < 3:
        try:
            log("[NewsSection] Querying general headlines fallback...")
            fallback_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="top_headlines",
                country="us",
                max_results=10,
            )
            if fallback_res.get("success") and fallback_res.get("articles"):
                existing_urls = {a.get("url") for a in raw_articles if a.get("url")}
                for a in fallback_res.get("articles", []):
                    if a.get("url") not in existing_urls:
                        raw_articles.append(a)
        except Exception as e:
            logger.debug(f"[NewsSection] Fallback headlines failed: {e}")

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Select top 3 distinct stories with concise summaries
    selected_stories = await asyncio.to_thread(
        select_top_three_stories_with_llm,
        articles=raw_articles,
        location_desc=location_desc,
    )

    if not selected_stories:
        log_error("[NewsSection] No news articles could be retrieved.")
        selected_stories = []

    # Store in Vault
    saved_record = await asyncio.to_thread(
        save_daily_suggestions_data,
        {
            "news": selected_stories,
            "date_news": now_iso,
        }
    )

    log(f"[NewsSection] News refreshed ({len(selected_stories)} stories) and persisted.")

    # Broadcast updated news over WebSocket
    try:
        await ws_manager.broadcast_daily_suggestions_update(
            "news",
            {
                "status": "ready",
                "news": selected_stories,
                "date_news": now_iso,
                "record_id": saved_record.get("id"),
            }
        )
    except Exception as e:
        log_error(f"[NewsSection] Failed to broadcast news update via WebSocket: {e}")

    return selected_stories
