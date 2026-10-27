from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from .vault_client import fetch_latest_daily_suggestions, save_daily_suggestions_data
from .config import DEFAULT_NEWS_INTERVAL_HOURS
from chat.workflow.news_tool import fetch_news_from_gnews, resolve_country_code
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


def verify_article_timestamp(art: Dict[str, Any], max_hours: float = 36.0) -> Tuple[bool, float, str]:
    """
    Verifies article publication timestamp.
    Returns (is_within_max_hours, age_hours, iso_timestamp_str).
    """
    raw_pub = art.get("publishedAt") or art.get("published_at")
    dt = parse_timestamp(raw_pub)
    now_utc = datetime.now(timezone.utc)

    if not dt:
        # Missing or unparseable timestamp cannot be verified as within 36 hours
        return False, 999.0, ""

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    age_hours = (now_utc - dt).total_seconds() / 3600.0
    # Allow 2 hours of clock skew into the future
    is_fresh = -2.0 <= age_hours <= max_hours
    iso_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return is_fresh, max(0.0, age_hours), iso_str


def normalize_story_title(title: str) -> str:
    """Normalizes title string for deduplication."""
    t = re.sub(r"['’]", "", (title or "").lower())
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', t).strip()
    words = [w for w in cleaned.split() if len(w) > 2]
    return " ".join(words[:7])


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
    country_name: str = "your country",
) -> List[Dict[str, Any]]:
    """
    Uses LLM to select the three most relevant, trending, and impactful domestic stories for the user:
    - High priority for stories from the user's country (domestic national affairs, policy, economy).
    - Strictly avoids selecting foreign-only international news when domestic stories are available.
    - Strictly avoids duplicate stories and overlapping event coverage.
    - Prioritizes articles published within the last 36 hours.
    - Generates concise, factually accurate summaries (1-2 sentences).
    """
    if not articles:
        return []

    # Send up to top 10 prioritized candidate articles
    chosen = articles[:10]

    items_text: List[str] = []
    for idx, art in enumerate(chosen):
        title = art.get("title", "Untitled").strip()
        desc = art.get("description", "").strip()
        src = art.get("source", {}).get("name") if isinstance(art.get("source"), dict) else str(art.get("source", "News"))
        pub = art.get("published_at") or art.get("publishedAt", "")
        origin = art.get("_origin", "National")
        age_h = art.get("_age_hours", 0.0)
        fresh_tag = f"Published ~{int(round(age_h))}h ago" if age_h > 0 else "Published recently"
        items_text.append(
            f"Story #{idx + 1} ({origin} • {fresh_tag}):\n"
            f"Title: {title}\nSource: {src}\nDescription: {desc}\n"
            f"URL: {art.get('url', '')}\nPublishedAt: {pub}"
        )

    combined = "\n\n".join(items_text)
    prompt = f"""You are MIRA's Chief News Editor.
The user lives in {country_name} ({location_desc or country_name}).

Candidate news stories:
{combined}

Task:
Select the THREE most relevant, trending, and impactful domestic news stories for the user.

STRICT COUNTRY SELECTION RULES:
1. HIGHEST PRIORITY FOR USER'S COUNTRY ({country_name.upper()}):
   - You MUST prioritize stories directly about {country_name} (domestic national developments, policy, economy, infrastructure, science/space, society, or major national events).
   - Under NO circumstances should you select foreign-only international news (e.g. elections in Brazil or other foreign countries) when domestic stories concerning {country_name} are available.
2. Freshness: Strictly prioritize stories published within the last 36 hours.
3. Impact & Relevance: Choose stories with broad national significance or high public interest in {country_name}.
4. No Duplicates: Every selected story MUST cover a distinct topic or event (never pick multiple stories about the same event).
5. Factual Accuracy: For each story, provide a concise 1-2 sentence summary preserving 100% factual accuracy. Do NOT embellish or speculate.
6. Output Format: Return strictly a valid JSON array of 3 objects:
[
  {{
    "title": "Clean, engaging headline",
    "summary": "1-2 sentence concise, factually accurate summary.",
    "url": "original article URL",
    "source": "News source name",
    "published_at": "original publication timestamp"
  }}
]
Do not output any introductory or concluding text outside the JSON array."""

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

    # Deterministic fallback: strictly prioritize domestic country candidates
    fallback_stories: List[Dict[str, Any]] = []
    seen_keys = set()
    for art in articles:
        title = (art.get("title") or "").strip()
        key = normalize_story_title(title)
        url = (art.get("url") or "").strip()
        if not title or key in seen_keys or url in seen_keys:
            continue
        seen_keys.add(key)
        if url:
            seen_keys.add(url)

        desc = (art.get("description") or art.get("content") or "").strip()
        if len(desc) > 220:
            desc = desc[:217] + "..."

        src_name = art.get("source", {}).get("name") if isinstance(art.get("source"), dict) else str(art.get("source", "News"))
        pub = art.get("published_at") or art.get("publishedAt", "")

        fallback_stories.append({
            "title": title,
            "summary": desc or "Click to read the full report.",
            "url": url,
            "source": src_name,
            "published_at": pub,
        })
        if len(fallback_stories) == 3:
            break

    return fallback_stories


async def refresh_news(force: bool = False) -> List[Dict[str, Any]]:
    """
    Executes News refresh:
      1. Checks if user location is configured. If not, skips immediately.
      2. Checks daily_suggestions table.
      3. If not needed and not forced, returns current data.
      4. Retrieves user's country and city/region from Vault.
      5. Queries News Tool prioritizing Country first, then City/Region.
      6. Verifies publication timestamps (prioritizing last 36 hours) and eliminates duplicates.
      7. Selects top 3 distinct, trending, impactful stories with concise factual summaries.
      8. Stores in news and date_news in Vault.
      9. Broadcasts updated news to frontend via WebSockets.
    """
    # 1. Check whether user location is configured before making any calls
    user_profile = await asyncio.to_thread(get_user_profile, force_refresh=True) or {}
    raw_country = (user_profile.get("country") or "").strip()
    city = (user_profile.get("city") or "").strip()
    state = (user_profile.get("state") or "").strip()
    lat = user_profile.get("latitude")
    lon = user_profile.get("longitude")

    has_location = bool(raw_country or city or state or (lat is not None and lon is not None))
    if not has_location:
        log("[NewsSection] User location is not configured. Skipping location-based news refresh.")
        return []

    # Protect backend: check if GNews API key is configured before making any calls
    from config import CONFIG
    if not CONFIG.has_gnews_key(force_refresh=True):
        log_error("[NewsSection] No GNews API keys configured in Vault. Skipping news refresh to protect backend.")
        try:
            await ws_manager.broadcast_daily_suggestions_update(
                "news",
                {
                    "status": "error",
                    "error": "NO_GNEWS_KEY",
                    "message": "You don't have any GNews API keys configured. Please add a GNews key in Tools > News.",
                    "route": "/tools/news",
                }
            )
        except Exception:
            pass
        return []

    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)
    if not force and not is_news_refresh_needed(current_record):
        log("[NewsSection] News headlines are already up-to-date. Skipping refresh.")
        return current_record.get("news") or [] if current_record else []

    log("[NewsSection] Initiating news headlines refresh...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("news", {"status": "refreshing"})
    except Exception:
        pass

    country_input = raw_country or "us"
    country_code = resolve_country_code(country_input)
    country_display = raw_country or country_code.upper()
    location_desc = f"{city}, {country_display}" if city else country_display

    raw_candidates: List[Dict[str, Any]] = []
    seen_urls: Set[str] = set()
    seen_titles: Set[str] = set()

    def add_article_candidate(art: Dict[str, Any], origin: str, priority_tier: int):
        url = (art.get("url") or "").strip().lower()
        title = (art.get("title") or "").strip()
        norm_title = normalize_story_title(title)

        if not title or (url and url in seen_urls) or (norm_title and norm_title in seen_titles):
            return

        if url:
            seen_urls.add(url)
        if norm_title:
            seen_titles.add(norm_title)

        is_fresh, age_hours, iso_pub = verify_article_timestamp(art, max_hours=36.0)

        candidate = dict(art)
        candidate["published_at"] = iso_pub
        candidate["_origin"] = origin
        candidate["_priority_tier"] = priority_tier  # 1 = National Domestic, 2 = Regional, 3 = General National, 4 = Foreign/Fallback
        candidate["_is_within_36h"] = is_fresh
        candidate["_age_hours"] = age_hours
        raw_candidates.append(candidate)

    # 1. Primary Priority: Top National Domestic News from user's country (category='nation')
    try:
        log(f"[NewsSection] Querying top national domestic news for user's country: '{country_code}' ({country_display}) [category=nation]...")
        nation_res = await asyncio.to_thread(
            fetch_news_from_gnews,
            operation="top_headlines",
            country=country_code,
            category="nation",
            max_results=10,
        )
        if nation_res.get("success") and nation_res.get("articles"):
            for a in nation_res.get("articles", []):
                add_article_candidate(a, origin=f"National Domestic ({country_display})", priority_tier=1)
    except Exception as e:
        log_error(f"[NewsSection] Country national domestic headlines query failed: {e}")

    # 2. Secondary Priority: Search news for user's city or region within country
    query_target = city or state
    if query_target:
        try:
            log(f"[NewsSection] Querying regional domestic news for: '{query_target}' ({country_code})...")
            city_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="search",
                q=query_target,
                country=country_code,
                max_results=10,
            )
            if city_res.get("success") and city_res.get("articles"):
                for a in city_res.get("articles", []):
                    add_article_candidate(a, origin=f"Regional ({query_target}, {country_display})", priority_tier=2)
        except Exception as e:
            logger.debug(f"[NewsSection] Regional news search failed: {e}")

    # 3. Tertiary Priority: Search news specifically for the country name if candidates < 6
    if len([c for c in raw_candidates if c.get("_priority_tier", 9) <= 2]) < 6 and country_display:
        try:
            log(f"[NewsSection] Querying domestic search news for: '{country_display}' ({country_code})...")
            country_search_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="search",
                q=country_display,
                country=country_code,
                max_results=10,
            )
            if country_search_res.get("success") and country_search_res.get("articles"):
                for a in country_search_res.get("articles", []):
                    add_article_candidate(a, origin=f"National Search ({country_display})", priority_tier=2)
        except Exception as e:
            logger.debug(f"[NewsSection] Country search query failed: {e}")

    # 4. Quaternary Priority: General top headlines for user's country (filtering foreign-only stories)
    try:
        log(f"[NewsSection] Querying general headlines for user's country: '{country_code}' ({country_display})...")
        general_res = await asyncio.to_thread(
            fetch_news_from_gnews,
            operation="top_headlines",
            country=country_code,
            category="general",
            max_results=10,
        )
        if general_res.get("success") and general_res.get("articles"):
            foreign_keywords = (
                "brazil", "bolsonaro", "lula", "gaza", "israel", "netanyahu",
                "lebanon", "ukraine", "russia", "putin", "zelensky", "taiwan",
                "pentagon", "white house", "biden", "trump"
            )
            user_country_lower = country_display.lower()
            for a in general_res.get("articles", []):
                t_lower = (a.get("title") or "").lower()
                desc_lower = (a.get("description") or "").lower()
                is_foreign_only = (
                    any(fk in t_lower or fk in desc_lower for fk in foreign_keywords)
                    and user_country_lower not in t_lower
                    and user_country_lower not in desc_lower
                )
                tier = 4 if is_foreign_only else 3
                origin_label = "World/Foreign" if is_foreign_only else f"General Headlines ({country_display})"
                add_article_candidate(a, origin=origin_label, priority_tier=tier)
    except Exception as e:
        log_error(f"[NewsSection] General headlines query failed: {e}")

    # 5. Fallback: Global top headlines only if fewer than 3 total candidates exist
    if len(raw_candidates) < 3:
        try:
            log("[NewsSection] Querying general fallback headlines...")
            fallback_res = await asyncio.to_thread(
                fetch_news_from_gnews,
                operation="top_headlines",
                country="us",
                max_results=10,
            )
            if fallback_res.get("success") and fallback_res.get("articles"):
                for a in fallback_res.get("articles", []):
                    add_article_candidate(a, origin="Global Fallback", priority_tier=5)
        except Exception as e:
            logger.debug(f"[NewsSection] Fallback headlines failed: {e}")

    # Sort candidates strictly prioritizing:
    # 1. Domestic country/regional priority first (priority_tier 1, then 2, then 3)
    # 2. Freshness within last 36 hours (is_within_36h == True)
    # 3. Newest publication timestamp (smaller age_hours)
    raw_candidates.sort(
        key=lambda c: (
            c.get("_priority_tier", 9),
            0 if c.get("_is_within_36h") else 1,
            c.get("_age_hours", 999.0)
        )
    )

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Select top 3 distinct, trending, and impactful domestic stories with LLM
    selected_stories = await asyncio.to_thread(
        select_top_three_stories_with_llm,
        articles=raw_candidates,
        location_desc=location_desc,
        country_name=country_display,
    )

    if not selected_stories:
        log_error("[NewsSection] No news articles could be selected.")
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
