from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import requests

from .state import AgentState
from vault_logger import log, log_error
from config import get_user_profile, get_gnews_config

logger = logging.getLogger("mira.engine.chat.workflow.news_tool")

GNEWS_TOP_HEADLINES_URL = "https://gnews.io/api/v4/top-headlines"
GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search"

DEFAULT_COUNTRY = "us"
DEFAULT_LANG = "en"
MAX_FREE_TIER_ARTICLES = 10
DEFAULT_ARTICLES = 8
MAX_QUERY_LENGTH = 200

# Supported countries in GNews v4 API (30 countries)
# https://gnews.io/docs/v4#countries
GNEWS_SUPPORTED_COUNTRIES = {
    "au", "br", "ca", "cn", "eg", "fr", "de", "gr", "hk", "in",
    "ie", "il", "it", "jp", "nl", "no", "pk", "pe", "ph", "pt",
    "ro", "ru", "sg", "es", "se", "ch", "tw", "ua", "gb", "us"
}

# Country name and alias mapping to ISO 3166-1 alpha-2 codes
GNEWS_COUNTRY_MAP: Dict[str, str] = {
    "australia": "au",
    "brazil": "br",
    "brasil": "br",
    "canada": "ca",
    "china": "cn",
    "egypt": "eg",
    "france": "fr",
    "french": "fr",
    "germany": "de",
    "german": "de",
    "deutschland": "de",
    "greece": "gr",
    "greek": "gr",
    "hong kong": "hk",
    "hongkong": "hk",
    "india": "in",
    "indian": "in",
    "bharat": "in",
    "ireland": "ie",
    "irish": "ie",
    "israel": "il",
    "israeli": "il",
    "italy": "it",
    "italian": "it",
    "japan": "jp",
    "japanese": "jp",
    "netherlands": "nl",
    "holland": "nl",
    "dutch": "nl",
    "norway": "no",
    "norwegian": "no",
    "pakistan": "pk",
    "pakistani": "pk",
    "peru": "pe",
    "peruvian": "pe",
    "philippines": "ph",
    "filipino": "ph",
    "portugal": "pt",
    "portuguese": "pt",
    "romania": "ro",
    "romanian": "ro",
    "russia": "ru",
    "russian": "ru",
    "singapore": "sg",
    "spain": "es",
    "spanish": "es",
    "espana": "es",
    "sweden": "se",
    "swedish": "se",
    "switzerland": "ch",
    "swiss": "ch",
    "taiwan": "tw",
    "taiwanese": "tw",
    "ukraine": "ua",
    "ukrainian": "ua",
    "united kingdom": "gb",
    "uk": "gb",
    "great britain": "gb",
    "britain": "gb",
    "british": "gb",
    "england": "gb",
    "english": "gb",
    "united states": "us",
    "united states of america": "us",
    "usa": "us",
    "us": "us",
    "america": "us",
    "american": "us",
}

# Categories supported by GNews top-headlines
GNEWS_SUPPORTED_CATEGORIES = {
    "general", "world", "nation", "business", "technology",
    "entertainment", "sports", "science", "health"
}

# Synonyms and mapping to canonical GNews category names
GNEWS_CATEGORY_MAP: Dict[str, str] = {
    "tech": "technology",
    "technology": "technology",
    "technologies": "technology",
    "computers": "technology",
    "computing": "technology",
    "software": "technology",
    "hardware": "technology",
    "ai": "technology",
    "artificial intelligence": "technology",
    "gadgets": "technology",
    "business": "business",
    "finance": "business",
    "financial": "business",
    "economy": "business",
    "economic": "business",
    "economics": "business",
    "stocks": "business",
    "stock market": "business",
    "markets": "business",
    "crypto": "business",
    "cryptocurrency": "business",
    "banking": "business",
    "sports": "sports",
    "sport": "sports",
    "football": "sports",
    "cricket": "sports",
    "soccer": "sports",
    "basketball": "sports",
    "nba": "sports",
    "tennis": "sports",
    "baseball": "sports",
    "entertainment": "entertainment",
    "movies": "entertainment",
    "cinema": "entertainment",
    "films": "entertainment",
    "music": "entertainment",
    "celebrity": "entertainment",
    "celebrities": "entertainment",
    "hollywood": "entertainment",
    "bollywood": "entertainment",
    "gaming": "entertainment",
    "games": "entertainment",
    "health": "health",
    "medical": "health",
    "medicine": "health",
    "healthcare": "health",
    "wellness": "health",
    "fitness": "health",
    "pharma": "health",
    "pharmaceutical": "health",
    "science": "science",
    "scientific": "science",
    "space": "science",
    "astronomy": "science",
    "physics": "science",
    "biology": "science",
    "nasa": "science",
    "world": "world",
    "global": "world",
    "international": "world",
    "foreign": "world",
    "nation": "nation",
    "national": "nation",
    "politics": "nation",
    "political": "nation",
    "government": "nation",
    "general": "general",
}

# Common cities and regions for location detection (maps to country code if known)
COMMON_CITIES_AND_REGIONS: Dict[str, Optional[str]] = {
    "new york": "us",
    "los angeles": "us",
    "chicago": "us",
    "houston": "us",
    "phoenix": "us",
    "philadelphia": "us",
    "san antonio": "us",
    "san diego": "us",
    "dallas": "us",
    "san jose": "us",
    "austin": "us",
    "san francisco": "us",
    "seattle": "us",
    "denver": "us",
    "washington": "us",
    "boston": "us",
    "atlanta": "us",
    "miami": "us",
    "california": "us",
    "texas": "us",
    "florida": "us",
    "london": "gb",
    "manchester": "gb",
    "birmingham": "gb",
    "edinburgh": "gb",
    "glasgow": "gb",
    "liverpool": "gb",
    "paris": "fr",
    "marseille": "fr",
    "lyon": "fr",
    "berlin": "de",
    "munich": "de",
    "frankfurt": "de",
    "hamburg": "de",
    "mumbai": "in",
    "delhi": "in",
    "new delhi": "in",
    "bangalore": "in",
    "bengaluru": "in",
    "hyderabad": "in",
    "chennai": "in",
    "kolkata": "in",
    "pune": "in",
    "ahmedabad": "in",
    "tokyo": "jp",
    "osaka": "jp",
    "kyoto": "jp",
    "toronto": "ca",
    "vancouver": "ca",
    "montreal": "ca",
    "calgary": "ca",
    "ottawa": "ca",
    "sydney": "au",
    "melbourne": "au",
    "brisbane": "au",
    "perth": "au",
    "dubai": None,
    "abu dhabi": None,
    "seoul": None,
    "beijing": "cn",
    "shanghai": "cn",
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
    if len(cleaned) == 2 and cleaned in GNEWS_SUPPORTED_COUNTRIES:
        return cleaned
    return DEFAULT_COUNTRY


def resolve_category(cat_str: Optional[str]) -> Optional[str]:
    """Resolves and validates a category string to GNews supported categories."""
    if not cat_str:
        return None
    cleaned = cat_str.strip().lower()
    if cleaned in GNEWS_CATEGORY_MAP:
        return GNEWS_CATEGORY_MAP[cleaned]
    if cleaned in GNEWS_SUPPORTED_CATEGORIES:
        return cleaned
    return None


def parse_date_range(
    time_expr: Optional[str],
    ref_dt: Optional[datetime] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Parses natural language date expressions or ISO date strings into
    GNews-compliant ISO 8601 UTC strings: YYYY-MM-DDTHH:MM:SSZ.
    """
    if not time_expr:
        return None, None

    expr = time_expr.strip().lower()
    now_utc = ref_dt or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    else:
        now_utc = now_utc.astimezone(timezone.utc)

    # 1. "yesterday"
    if "yesterday" in expr:
        start = (now_utc - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1, microseconds=-1)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 2. "today" or "tonight"
    if "today" in expr or "tonight" in expr:
        start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 3. "past 24 hours" / "last 24 hours" / "24hr"
    if "24 hour" in expr or "24hr" in expr or "past day" in expr or "last day" in expr:
        start = now_utc - timedelta(hours=24)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 4. "past week" / "last 7 days" / "last week" / "this week"
    if "week" in expr or "7 days" in expr:
        start = now_utc - timedelta(days=7)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 5. "past month" / "last 30 days" / "last month"
    if "month" in expr or "30 days" in expr:
        start = now_utc - timedelta(days=30)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 6. "past N days" or "last N days"
    m_days = re.search(r'(?:past|last)\s+(\d{1,2})\s*days?', expr)
    if m_days:
        num = int(m_days.group(1))
        start = now_utc - timedelta(days=num)
        return start.strftime("%Y-%m-%dT%H:%M:%SZ"), now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 7. Explicit ISO / YYYY-MM-DD pattern: e.g. "2026-10-20 to 2026-10-25" or "2026-10-20"
    iso_matches = re.findall(r'\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?\b', time_expr)
    if len(iso_matches) >= 2:
        from_str = iso_matches[0]
        to_str = iso_matches[1]
        if "T" not in from_str:
            from_str = f"{from_str}T00:00:00Z"
        if "T" not in to_str:
            to_str = f"{to_str}T23:59:59Z"
        return from_str, to_str
    elif len(iso_matches) == 1:
        single = iso_matches[0]
        if "T" not in single:
            return f"{single}T00:00:00Z", f"{single}T23:59:59Z"
        return single, now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    return None, None


def update_vault_active_key(new_index: int) -> bool:
    """Updates active GNews key index in Vault to persist key rotation on failover."""
    try:
        from config import VAULT_URL, get_service_url
        vault_url = VAULT_URL or get_service_url("vault")
        if vault_url:
            resp = requests.post(
                f"{vault_url.rstrip('/')}/news/config",
                json={"current_key": new_index},
                timeout=1.5,
            )
            if resp.status_code == 200:
                log(f"[GNews] Persisted active key rotation (index {new_index}) to Vault API.")
                return True
    except Exception as e:
        logger.debug(f"[GNews] Failed updating active key via Vault API: {e}")

    try:
        import sys
        from pathlib import Path
        vault_dir = Path(__file__).resolve().parent.parent.parent.parent / "Vault"
        if str(vault_dir) not in sys.path:
            sys.path.insert(0, str(vault_dir))
        import config_storage
        config_storage.init_config_storage()
        config_storage.update_gnews_config(current_key=new_index)
        log(f"[GNews] Persisted active key rotation (index {new_index}) via direct Vault storage.")
        return True
    except Exception as e:
        logger.debug(f"[GNews] Direct Vault config_storage update failed: {e}")
        return False


def plan_news_query(
    user_query: str,
    user_profile: Optional[Dict[str, Any]] = None,
    llm_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Intelligently plans the GNews operation, parameters, and filters.
    Balances LLM retrieval planning (if provided) with deterministic fallbacks.
    - Routes cities, regions, specific entities, keywords, and date ranges to 'search'.
    - Routes broad headlines, categories, and country overviews to 'top-headlines'.
    - Enforces free-plan limit (max 10) and query length limit (max 200 chars).
    """
    profile = user_profile or {}
    q_lower = (user_query or "").strip().lower()
    user_default_country = resolve_country_code(profile.get("country"))

    # Initial values from LLM plan if available
    llm_op = (llm_plan.get("operation") if llm_plan else None) or ""
    llm_q = (llm_plan.get("q") if llm_plan else None)
    llm_cat = (llm_plan.get("category") if llm_plan else None)
    llm_country = (llm_plan.get("country") if llm_plan else None)
    llm_loc = (llm_plan.get("location") if llm_plan else None)
    llm_lang = (llm_plan.get("lang") if llm_plan else None) or DEFAULT_LANG
    llm_sortby = (llm_plan.get("sortby") if llm_plan else None) or "publishedAt"
    llm_time_expr = (llm_plan.get("time_expression") if llm_plan else None)
    llm_max = llm_plan.get("max_results") if llm_plan else None
    llm_page = llm_plan.get("page") if llm_plan else None
    llm_in = llm_plan.get("in") if llm_plan else None
    llm_nullable = llm_plan.get("nullable") if llm_plan else None
    llm_truncate = llm_plan.get("truncate") if llm_plan else None

    # 1. Location detection (city or region)
    detected_location: Optional[str] = llm_loc
    location_country: Optional[str] = None
    if not detected_location:
        for city, ccode in COMMON_CITIES_AND_REGIONS.items():
            if re.search(rf"\b{re.escape(city)}\b", q_lower):
                detected_location = city.title()
                location_country = ccode
                break

    # 2. Country detection
    detected_country: Optional[str] = None
    if llm_country:
        detected_country = resolve_country_code(llm_country)
    else:
        for cname, ccode in GNEWS_COUNTRY_MAP.items():
            if re.search(rf"\b{re.escape(cname)}\b", q_lower):
                detected_country = ccode
                break
        if not detected_country and location_country:
            detected_country = location_country
        if not detected_country:
            detected_country = user_default_country

    # 3. Category detection
    detected_category: Optional[str] = resolve_category(llm_cat)
    if not detected_category:
        for syn, canon in GNEWS_CATEGORY_MAP.items():
            if re.search(rf"\b{re.escape(syn)}\b", q_lower):
                detected_category = canon
                break

    # 4. Date range parsing
    time_expression = llm_time_expr
    if not time_expression:
        for t_phrase in ["yesterday", "past 24 hours", "last 24 hours", "today", "past week", "last week", "this week", "past month", "last month", "last 7 days", "last 30 days"]:
            if t_phrase in q_lower:
                time_expression = t_phrase
                break
    from_date, to_date = parse_date_range(time_expression)

    # 5. Sorting preference
    sortby = "publishedAt"
    if llm_sortby in ("relevance", "publishedAt"):
        sortby = llm_sortby
    elif any(term in q_lower for term in ["relevant", "relevance", "most relevant", "best match"]):
        sortby = "relevance"

    # 6. Search query / keywords
    search_q: Optional[str] = llm_q
    if not search_q:
        generic_stopwords = {
            "what", "whats", "what's", "is", "are", "the", "a", "an", "and", "or",
            "tell", "me", "show", "give", "latest", "breaking", "top", "trending",
            "current", "news", "headlines", "headline", "today", "now", "stories",
            "story", "updates", "update", "briefing", "daily", "happening", "going",
            "on", "can", "you", "please", "for", "with", "from", "about", "in", "of",
            "some", "any", "general", "recent", "get", "look", "up", "there", "any"
        }
        all_words = re.findall(r'\b[a-z0-9]+\b', q_lower)
        meaningful_tokens = [
            w for w in all_words
            if w not in generic_stopwords
            and w not in GNEWS_COUNTRY_MAP
            and w not in GNEWS_CATEGORY_MAP
            and len(w) > 1
        ]
        if meaningful_tokens:
            search_q = " ".join(meaningful_tokens)

    # 7. Endpoint operation determination
    # Rules:
    # - If city/location is detected -> Must use 'search' (GNews rejects cities in country parameter)
    # - If date range (from/to) is present -> Must use 'search' (top-headlines doesn't support dates)
    # - If explicit search keywords or entity query present -> Use 'search'
    # - Otherwise (broad headlines, category only, or country only) -> Use 'top-headlines'
    if llm_op in ("top_headlines", "search"):
        operation = llm_op
    elif detected_location or from_date or to_date or search_q:
        operation = "search"
    else:
        operation = "top_headlines"

    # If search endpoint is selected, assemble effective query 'q'
    final_q = search_q
    if operation == "search":
        q_parts = []
        if detected_location:
            q_parts.append(detected_location)
        if search_q and search_q.lower() != (detected_location or "").lower():
            q_parts.append(search_q)
        elif detected_category and not q_parts:
            q_parts.append(detected_category)
        
        final_q = " ".join(q_parts).strip()
        if not final_q:
            final_q = detected_category or "news"
        # Enforce GNews max 200 characters limit
        final_q = final_q[:MAX_QUERY_LENGTH].strip()
    else:
        # In top-headlines, 'q' is optional keywords
        if final_q:
            final_q = final_q[:MAX_QUERY_LENGTH].strip()

    # Article limit (enforcing free-plan limit of 10)
    max_count = DEFAULT_ARTICLES
    if llm_max is not None:
        try:
            max_count = max(1, min(int(llm_max), MAX_FREE_TIER_ARTICLES))
        except (ValueError, TypeError):
            max_count = DEFAULT_ARTICLES

    # Context label for user presentation
    context_parts = []
    if detected_location:
        context_parts.append(detected_location)
    elif detected_category:
        context_parts.append(detected_category.capitalize())
    if detected_country:
        context_parts.append(detected_country.upper())
    context_label = " | ".join(context_parts) if context_parts else (detected_country or DEFAULT_COUNTRY).upper()

    return {
        "operation": operation,
        "q": final_q,
        "category": detected_category if operation == "top_headlines" else None,
        "country": detected_country,
        "location": detected_location,
        "lang": llm_lang or DEFAULT_LANG,
        "from": from_date,
        "to": to_date,
        "sortby": sortby,
        "max": max_count,
        "page": max(1, int(llm_page or 1)),
        "in": llm_in,
        "nullable": llm_nullable,
        "truncate": llm_truncate,
        "context_label": context_label,
    }


def fetch_news_from_gnews(
    *,
    operation: str = "top_headlines",
    country: Optional[str] = None,
    query: Optional[str] = None,
    q: Optional[str] = None,
    category: Optional[str] = None,
    lang: str = DEFAULT_LANG,
    max_results: int = DEFAULT_ARTICLES,
    page: int = 1,
    in_fields: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    sortby: str = "publishedAt",
    nullable: Optional[str] = None,
    truncate: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes request to GNews API v4 using either top-headlines or search endpoint.
    Supports key rotation across all configured Vault keys on rate limits (429)
    or invalid/unauthorized keys (401/403).

    PRIVACY GUARANTEE:
    MIRA uses your selected country to retrieve relevant news through GNews.
    Your personal data is not sent to GNews; only the country information required
    for the news request is used.
    """
    effective_q = (q or query or "").strip()

    # 1. Resolve candidate API keys from Vault
    keys_to_attempt: List[Tuple[int, str]] = []
    if api_key:
        keys_to_attempt = [(0, api_key)]
    else:
        cfg = get_gnews_config()
        vault_keys = cfg.get("keys", [])
        current_idx = cfg.get("current_key", 0)

        if not vault_keys:
            return {
                "success": False,
                "error": "no_api_key",
                "message": (
                    "No GNews API key configured in MIRA Vault. "
                    "Please configure your GNews API key in the Tools -> News configuration tab."
                ),
                "articles": [],
                "total_articles": 0,
            }

        # Sequence keys starting with the current active key
        ordered_indices = []
        if 0 <= current_idx < len(vault_keys):
            ordered_indices.append(current_idx)
        for i in range(len(vault_keys)):
            if i not in ordered_indices:
                ordered_indices.append(i)

        keys_to_attempt = [(i, vault_keys[i]) for i in ordered_indices]

    country_code = resolve_country_code(country)
    clamped_max = max(1, min(max_results, MAX_FREE_TIER_ARTICLES))
    endpoint_url = GNEWS_SEARCH_URL if operation == "search" else GNEWS_TOP_HEADLINES_URL

    last_error_type = "unknown_error"
    last_error_msg = "Failed to retrieve news from GNews."
    had_rate_limit = False
    had_auth_failure = False

    # 2. Key Rotation Loop
    for attempt_idx, key in keys_to_attempt:
        params: Dict[str, Any] = {
            "apikey": key,
            "lang": lang or DEFAULT_LANG,
            "max": clamped_max,
        }
        if country_code:
            params["country"] = country_code
        if page and page > 1:
            params["page"] = page
        if nullable:
            params["nullable"] = nullable

        if operation == "search":
            # GNews search requires 'q'
            search_query = effective_q[:MAX_QUERY_LENGTH] if effective_q else "news"
            params["q"] = search_query
            if in_fields:
                params["in"] = in_fields
            if from_date:
                params["from"] = from_date
            if to_date:
                params["to"] = to_date
            if sortby in ("publishedAt", "relevance"):
                params["sortby"] = sortby
            if truncate:
                params["truncate"] = truncate
        else:
            # Top-headlines endpoint
            if category:
                canonical_cat = resolve_category(category)
                if canonical_cat:
                    params["category"] = canonical_cat
            if effective_q:
                params["q"] = effective_q[:MAX_QUERY_LENGTH]

        log(f"[GNews] Requesting endpoint='{operation}', params={{k: v for k, v in params.items() if k != 'apikey'}} with key index {attempt_idx}")

        try:
            resp = requests.get(
                endpoint_url,
                params=params,
                timeout=10,
                headers={"User-Agent": "MIRA-Assistant/1.0"}
            )

            if resp.status_code == 200:
                data = resp.json()
                articles = data.get("articles", [])
                total_articles = data.get("totalArticles", len(articles))

                # If we succeeded on a fallback key, persist active key update to Vault
                if not api_key and attempt_idx != keys_to_attempt[0][0]:
                    log(f"[GNews] Key failover successful! Updating active key index in Vault to {attempt_idx}.")
                    update_vault_active_key(attempt_idx)

                # Return sanitized params without API key
                safe_params = {k: v for k, v in params.items() if k != "apikey"}
                return {
                    "success": True,
                    "operation": operation,
                    "total_articles": total_articles,
                    "country": country_code,
                    "articles": articles,
                    "query_params": safe_params,
                }
            elif resp.status_code == 429:
                had_rate_limit = True
                last_error_type = "rate_limited"
                last_error_msg = "GNews API rate limit exceeded (100 requests/day per key on free tier)."
                log_error(f"[GNews] Key index {attempt_idx} rate limited (HTTP 429). Attempting rotation if remaining.")
                continue
            elif resp.status_code in (401, 403):
                had_auth_failure = True
                last_error_type = "auth_failed"
                last_error_msg = "GNews API key invalid or unauthorized. Please verify your API key in Tools -> News."
                log_error(f"[GNews] Key index {attempt_idx} unauthorized (HTTP {resp.status_code}). Attempting rotation if remaining.")
                continue
            elif resp.status_code == 400:
                # Client parameter error (e.g. invalid date format or query)
                err_text = resp.text
                log_error(f"[GNews] Bad Request (HTTP 400): {err_text}")
                return {
                    "success": False,
                    "error": "invalid_parameters",
                    "message": f"GNews rejected the request parameters: {err_text}",
                    "articles": [],
                    "total_articles": 0,
                }
            else:
                last_error_type = f"http_{resp.status_code}"
                last_error_msg = f"GNews API request failed with status code {resp.status_code}."
                log_error(f"[GNews] HTTP error: {resp.status_code} - {resp.text}")
                continue

        except requests.exceptions.RequestException as e:
            log_error(f"[GNews] Network exception with key index {attempt_idx}: {e}")
            last_error_type = "network_error"
            last_error_msg = f"Unable to reach GNews service: {str(e)}"
            continue

    # 3. Handle exhaustion of all keys
    if had_rate_limit and not had_auth_failure:
        last_error_msg = (
            "GNews API rate limit exceeded on all configured keys (100 requests/day per key on free tier). "
            "Please add another API key in Tools -> News or try again later."
        )
    elif had_auth_failure and not had_rate_limit:
        last_error_msg = (
            "GNews API key invalid or unauthorized across all configured keys. "
            "Please verify your API keys in Tools -> News."
        )

    return {
        "success": False,
        "error": last_error_type,
        "message": last_error_msg,
        "articles": [],
        "total_articles": 0,
    }


def format_articles_summary(
    articles: List[Dict[str, Any]],
    context_label: str = "",
    operation: str = "top_headlines"
) -> str:
    """Formats retrieved GNews articles into clean, readable markdown for the user."""
    if not articles:
        label = f" for '{context_label}'" if context_label else ""
        return f"No news articles found{label}. Try broadening your search or checking a different category."

    header = f"### Top Headlines ({context_label}):" if context_label else "### Latest News Headlines:"
    lines = [header, ""]

    for i, art in enumerate(articles, 1):
        title = art.get("title", "Untitled").strip()
        source = art.get("source", {}).get("name", "Unknown Source")
        desc = art.get("description", "").strip()
        url = art.get("url", "").strip()
        published = art.get("publishedAt", "").strip()

        date_str = ""
        if published:
            try:
                clean_pub = published.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean_pub)
                date_str = dt.strftime("%b %d, %Y, %I:%M %p UTC")
            except Exception:
                date_str = published

        lines.append(f"{i}. **{title}** — *{source}*")
        if date_str:
            lines.append(f"   *{date_str}*")
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
    Interprets user intent, plans query parameters, queries GNews API,
    and returns formatted news articles.
    """
    user_query = state.get("user_query", "").strip()
    user_profile = state.get("user_profile") or get_user_profile() or {}
    tool_params = state.get("tool_parameters") or {}
    llm_plan = tool_params.get("news_plan")

    # 1. Plan news query parameters
    plan = plan_news_query(user_query, user_profile, llm_plan=llm_plan)
    log(f"[NewsNode] Executing news plan: {plan}")

    # 2. Execute GNews API call
    res = fetch_news_from_gnews(
        operation=plan.get("operation", "top_headlines"),
        q=plan.get("q"),
        category=plan.get("category"),
        country=plan.get("country"),
        lang=plan.get("lang", DEFAULT_LANG),
        max_results=plan.get("max", DEFAULT_ARTICLES),
        page=plan.get("page", 1),
        in_fields=plan.get("in"),
        from_date=plan.get("from"),
        to_date=plan.get("to"),
        sortby=plan.get("sortby", "publishedAt"),
        nullable=plan.get("nullable"),
        truncate=plan.get("truncate"),
    )

    # 3. Format response summary
    context_label = plan.get("context_label") or (plan.get("country") or DEFAULT_COUNTRY).upper()
    if res.get("success"):
        articles = res.get("articles", [])
        summary_text = format_articles_summary(
            articles,
            context_label=context_label,
            operation=plan.get("operation", "top_headlines")
        )
    else:
        summary_text = res.get("message", "Unable to retrieve news at this time.")

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["news_response"] = summary_text
    current_outputs["news_articles"] = res.get("articles", [])
    current_outputs["news_data"] = {
        "operation": plan.get("operation"),
        "total_articles": res.get("total_articles", 0),
        "articles": res.get("articles", []),
        "plan": plan,
    }
    current_outputs["executed_node"] = "news"

    return {
        "node_outputs": current_outputs,
        "final_response": summary_text,
    }
