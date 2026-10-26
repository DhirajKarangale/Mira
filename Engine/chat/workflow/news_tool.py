from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional
import requests

from .state import AgentState
from vault_logger import log, log_error
from config import get_user_profile, get_gnews_config

logger = logging.getLogger("mira.engine.chat.workflow.news_tool")

GNEWS_TOP_HEADLINES_URL = "https://gnews.io/api/v4/top-headlines"
DEFAULT_COUNTRY = "us"

# Map common country names to ISO 3166-1 alpha-2 codes supported by GNews
# https://gnews.io/docs/v4#countries
GNEWS_COUNTRY_MAP: Dict[str, str] = {
    "australia": "au",
    "brazil": "br",
    "canada": "ca",
    "china": "cn",
    "egypt": "eg",
    "france": "fr",
    "germany": "de",
    "greece": "gr",
    "hong kong": "hk",
    "india": "in",
    "ireland": "ie",
    "israel": "il",
    "italy": "it",
    "japan": "jp",
    "netherlands": "nl",
    "norway": "no",
    "pakistan": "pk",
    "peru": "pe",
    "philippines": "ph",
    "portugal": "pt",
    "romania": "ro",
    "russia": "ru",
    "singapore": "sg",
    "spain": "es",
    "sweden": "se",
    "switzerland": "ch",
    "taiwan": "tw",
    "ukraine": "ua",
    "united kingdom": "gb",
    "uk": "gb",
    "great britain": "gb",
    "england": "gb",
    "united states": "us",
    "usa": "us",
    "us": "us",
}


def resolve_country_code(country_str: Optional[str]) -> str:
    """
    Resolves country string to a 2-letter GNews-supported ISO country code.
    Defaults to 'us' if unspecified or unrecognized.
    """
    if not country_str:
        return DEFAULT_COUNTRY
    cleaned = country_str.strip().lower()
    if cleaned in GNEWS_COUNTRY_MAP:
        return GNEWS_COUNTRY_MAP[cleaned]
    if len(cleaned) == 2 and cleaned in GNEWS_COUNTRY_MAP.values():
        return cleaned
    return DEFAULT_COUNTRY


def fetch_news_from_gnews(
    *,
    country: Optional[str] = None,
    query: Optional[str] = None,
    max_results: int = 10,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieves news headlines from GNews API v4.

    PRIVACY GUARANTEE:
    MIRA uses your selected country to retrieve relevant news through GNews.
    Your personal data is not sent to GNews; only the country information required
    for the news request is used.
    """
    # 1. Resolve API key from Vault if not explicitly passed
    active_key = api_key
    if not active_key:
        cfg = get_gnews_config()
        keys = cfg.get("keys", [])
        curr_idx = cfg.get("current_key", 0)
        if keys:
            if 0 <= curr_idx < len(keys):
                active_key = keys[curr_idx]
            else:
                active_key = keys[0]

    if not active_key:
        return {
            "success": False,
            "error": "no_api_key",
            "message": (
                "No GNews API key configured in MIRA Vault. "
                "Please configure your GNews API key in the Tools -> News configuration tab."
            ),
            "articles": [],
        }

    # 2. Resolve country code from profile or parameter
    country_code = resolve_country_code(country)

    # 3. Construct API request strictly containing country and API parameters (no personal info)
    params: Dict[str, Any] = {
        "country": country_code,
        "lang": "en",
        "max": max(1, min(max_results, 10)),
        "apikey": active_key,
    }
    if query and query.strip():
        params["q"] = query.strip()

    log(f"[GNews] Requesting news with country='{country_code}', query='{query or 'top-headlines'}' (no personal data sent)")

    try:
        resp = requests.get(
            GNEWS_TOP_HEADLINES_URL,
            params=params,
            timeout=10,
            headers={"User-Agent": "MIRA-Assistant/1.0"}
        )
        if resp.status_code == 200:
            data = resp.json()
            articles = data.get("articles", [])
            return {
                "success": True,
                "total_articles": len(articles),
                "country": country_code,
                "articles": articles,
            }
        elif resp.status_code == 401 or resp.status_code == 403:
            err_msg = "GNews API key invalid or unauthorized. Please verify your API key in Tools -> News."
            log_error(f"[GNews] Auth error: {resp.status_code} - {resp.text}")
            return {
                "success": False,
                "error": "auth_failed",
                "message": err_msg,
                "articles": [],
            }
        elif resp.status_code == 429:
            err_msg = "GNews API rate limit exceeded (100 requests/day on free tier)."
            log_error(f"[GNews] Rate limited: {resp.text}")
            return {
                "success": False,
                "error": "rate_limited",
                "message": err_msg,
                "articles": [],
            }
        else:
            err_msg = f"GNews API request failed with status code {resp.status_code}."
            log_error(f"[GNews] Error: {resp.status_code} - {resp.text}")
            return {
                "success": False,
                "error": f"http_{resp.status_code}",
                "message": err_msg,
                "articles": [],
            }
    except requests.exceptions.RequestException as e:
        log_error(f"[GNews] Network exception: {e}")
        return {
            "success": False,
            "error": "network_error",
            "message": f"Unable to reach GNews service: {str(e)}",
            "articles": [],
        }


def format_articles_summary(articles: List[Dict[str, Any]], country_code: str) -> str:
    """Formats retrieved GNews articles into clean, readable markdown for the user."""
    if not articles:
        return f"No news articles found for region '{country_code.upper()}'."

    lines = [f"### Latest Headlines ({country_code.upper()}):", ""]
    for i, art in enumerate(articles, 1):
        title = art.get("title", "Untitled")
        source = art.get("source", {}).get("name", "Unknown Source")
        desc = art.get("description", "")
        url = art.get("url", "")
        published = art.get("publishedAt", "")

        lines.append(f"{i}. **{title}** — *{source}*")
        if desc:
            lines.append(f"   {desc}")
        if url:
            lines.append(f"   [Read Article]({url})")
        lines.append("")

    return "\n".join(lines).strip()


def news_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 3 (Tool Node): Dynamic News LangGraph Node.
    Invoked when Decision Node routes to 'news'.
    Retrieves user profile country from state/Vault, queries GNews API,
    and returns formatted news articles.
    """
    user_query = state.get("user_query", "").strip()
    user_profile = state.get("user_profile") or get_user_profile() or {}
    country = user_profile.get("country", "")

    # Check if query requests a specific news topic (e.g. "tech news", "sports news")
    topic = None
    clean_q = user_query.lower()
    for kw in ["tech", "technology", "business", "science", "sports", "entertainment", "health", "world", "finance", "ai"]:
        if kw in clean_q:
            topic = kw
            break

    log(f"[NewsNode] Executing news tool: query='{user_query}', user_country='{country}', detected_topic='{topic}'")

    res = fetch_news_from_gnews(
        country=country,
        query=topic,
        max_results=8,
    )

    if res.get("success"):
        articles = res.get("articles", [])
        summary_text = format_articles_summary(articles, res.get("country", DEFAULT_COUNTRY))
    else:
        summary_text = res.get("message", "Unable to retrieve news at this time.")

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["news_response"] = summary_text
    current_outputs["news_articles"] = res.get("articles", [])
    current_outputs["executed_node"] = "news"

    return {
        "node_outputs": current_outputs,
        "final_response": summary_text,
    }
