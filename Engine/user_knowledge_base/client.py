from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root and Engine are in sys.path
_current_dir = Path(__file__).resolve().parent
_engine_dir = _current_dir.parent
_root_dir = _engine_dir.parent
for p in (_root_dir / "Vault", _root_dir / "Message_Broker", _root_dir, _engine_dir):
    p_str = str(p)
    if p_str not in sys.path:
        sys.path.insert(0, p_str)

try:
    from .storage import (
        get_full_knowledge_base,
        get_user_identity,
        search_knowledge_base,
    )
    from .config import get_kb_enc_path
except ImportError:
    from user_knowledge_base.storage import (
        get_full_knowledge_base,
        get_user_identity,
        search_knowledge_base,
    )
    from user_knowledge_base.config import get_kb_enc_path


# =============================================================================
# High-Level Reusable Data Retrieval Functions
# Can be imported and used across any script in the codebase:
#   from Engine.user_knowledge_base.client import get_user_preferences, get_user_profile
# =============================================================================

def get_user_profile(enc_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Retrieve user identity attributes (name, email, city, state, country, etc.)
    derived from Vault and stored in the encrypted Knowledge Base.
    """
    return get_user_identity(enc_path=enc_path)


def get_user_preferences(
    category: Optional[str] = None,
    preference_type: Optional[str] = None,
    status: str = "active",
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve distilled user preferences (likes, dislikes, hobbies, tools).

    Args:
        category: Optional filter (e.g. 'tech', 'food', 'lifestyle', 'gaming', 'work').
        preference_type: Optional filter ('like', 'dislike', 'hobby', 'preference').
        status: 'active' (default), 'past' (superseded), or 'all'.
        enc_path: Optional custom path to encrypted knowledge base file.

    Returns:
        List of matching preference dictionaries ordered by confidence and observation count.
    """
    kb = get_full_knowledge_base(enc_path=enc_path)
    prefs = kb.get("preferences", [])

    filtered: List[Dict[str, Any]] = []
    for p in prefs:
        if status != "all" and p.get("status") != status:
            continue
        if category and p.get("category", "").lower() != category.strip().lower():
            continue
        if preference_type and p.get("preference_type", "").lower() != preference_type.strip().lower():
            continue
        filtered.append(p)
    return filtered


def get_music_preferences(
    status: str = "active",
    genre: Optional[str] = None,
    platform: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve distilled music tastes, favorite artists, genres, and platforms.

    Args:
        status: 'active' (default), 'past', or 'all'.
        genre: Optional filter by genre (e.g. 'Rock', 'Pop', 'Lo-Fi').
        platform: Optional platform filter (e.g. 'Spotify', 'YouTube Music').
        enc_path: Optional custom path to encrypted knowledge base file.
    """
    kb = get_full_knowledge_base(enc_path=enc_path)
    music_items = kb.get("music_preferences", [])

    filtered: List[Dict[str, Any]] = []
    for m in music_items:
        if status != "all" and m.get("status") != status:
            continue
        if genre and genre.strip().lower() not in m.get("genre", "").lower():
            continue
        if platform and platform.strip().lower() not in m.get("platform", "").lower():
            continue
        filtered.append(m)
    return filtered


def get_viewing_interests(
    status: str = "current",
    media_type: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve movies, anime, TV series, or YouTube topics the user watches or likes.

    Args:
        status: 'current' (default), 'completed', 'interested', 'past', or 'all'.
        media_type: Optional media type filter (e.g. 'anime', 'movie', 'tv_series', 'youtube').
        enc_path: Optional custom path to encrypted knowledge base file.
    """
    kb = get_full_knowledge_base(enc_path=enc_path)
    views = kb.get("viewing_interests", [])

    filtered: List[Dict[str, Any]] = []
    for v in views:
        if status != "all" and v.get("status") != status:
            continue
        if media_type and v.get("media_type", "").lower() != media_type.strip().lower():
            continue
        filtered.append(v)
    return filtered


def get_sports_interests(
    status: str = "active",
    sport_name: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve sports interests, favorite teams, players, and interest levels.

    Args:
        status: 'active' (default), 'past', or 'all'.
        sport_name: Optional sport filter (e.g. 'cricket', 'football', 'f1').
        enc_path: Optional custom path to encrypted knowledge base file.
    """
    kb = get_full_knowledge_base(enc_path=enc_path)
    sports = kb.get("sports_interests", [])

    filtered: List[Dict[str, Any]] = []
    for s in sports:
        if status != "all" and s.get("status") != status:
            continue
        if sport_name and sport_name.strip().lower() not in s.get("sport_name", "").lower():
            continue
        filtered.append(s)
    return filtered


def get_user_likings(
    category: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve items, tools, styles, and habits the user explicitly likes, loves, or prefers.
    """
    return get_user_preferences(category=category, preference_type="like", status="active", enc_path=enc_path)


def get_user_dislikes(
    category: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve items, tools, styles, and habits the user explicitly hates, dislikes, or avoids.
    """
    return get_user_preferences(category=category, preference_type="dislike", status="active", enc_path=enc_path)


def get_life_activities(
    status: str = "ongoing",
    category: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Deprecated: Routine user activities are tracked in Activity Knowledge Base, not User Knowledge Base.
    Kept for backwards compatibility. Returns empty list.
    """
    return []


def search_user_knowledge(
    query: str,
    limit: int = 5,
    category: Optional[str] = None,
    enc_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """
    Perform sub-millisecond full-text indexed search using SQLite FTS5 across all
    user knowledge domains (preferences, music, viewing, sports).
    """
    return search_knowledge_base(query=query, limit=limit, category=category, enc_path=enc_path)


def get_complete_knowledge_base(enc_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Retrieve the entire structured knowledge base including stats and all categories.
    """
    return get_full_knowledge_base(enc_path=enc_path)


def get_user_summary_for_llm(max_items_per_category: int = 5, enc_path: Optional[Path] = None) -> str:
    """
    Generate a clean, focused, ready-to-inject string summarizing user profile,
    likings, and hateings/dislikes for LLM system prompts or conversational agents.
    """
    kb = get_full_knowledge_base(enc_path=enc_path)
    if not kb:
        return ""

    lines = []
    user_id = kb.get("user_identity", {})
    name = user_id.get("user_name", "")
    location_parts = [p for p in (user_id.get("city"), user_id.get("state"), user_id.get("country")) if p]
    loc_str = ", ".join(location_parts)

    if name:
        lines.append(f"User: {name}" + (f" ({loc_str})" if loc_str else ""))

    # Active Likings
    likes = [p for p in kb.get("preferences", []) if p.get("status") == "active" and p.get("preference_type") == "like"][:max_items_per_category]
    if likes:
        like_strs = [f"{p.get('item')} ({p.get('category', 'general')})" for p in likes]
        lines.append("Likes & Preferences: " + "; ".join(like_strs))

    # Active Dislikes / Hateings
    dislikes = [p for p in kb.get("preferences", []) if p.get("status") == "active" and p.get("preference_type") == "dislike"][:max_items_per_category]
    if dislikes:
        dislike_strs = [f"{p.get('item')} ({p.get('category', 'general')})" for p in dislikes]
        lines.append("Dislikes & Hates: " + "; ".join(dislike_strs))

    # Active music
    active_music = [m for m in kb.get("music_preferences", []) if m.get("status") == "active"][:max_items_per_category]
    if active_music:
        music_strs = [f"{m.get('artist') or m.get('genre')} on {m.get('platform') or 'music'}" for m in active_music]
        lines.append("Music Tastes: " + "; ".join(music_strs))

    # Active viewing
    active_views = [v for v in kb.get("viewing_interests", []) if v.get("status") in ("current", "interested")][:max_items_per_category]
    if active_views:
        view_strs = [f"{v.get('title')} ({v.get('media_type')})" for v in active_views]
        lines.append("Viewing: " + "; ".join(view_strs))

    # Active sports
    active_sports = [s for s in kb.get("sports_interests", []) if s.get("status") == "active"][:max_items_per_category]
    if active_sports:
        sport_strs = [f"{s.get('sport_name')} ({s.get('teams_or_players')})" for s in active_sports]
        lines.append("Sports: " + "; ".join(sport_strs))

    return "\n".join(lines)



# =============================================================================
# CLI Interface for Direct Execution
# =============================================================================

def _print_table(title: str, items: List[Dict[str, Any]], keys: List[str]) -> None:
    print(f"\n=== {title} ({len(items)}) ===")
    if not items:
        print("  (No records found)")
        return
    for idx, item in enumerate(items, 1):
        details = ", ".join(f"{k}: {item.get(k, '')}" for k in keys if item.get(k))
        print(f"  {idx}. {details}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MIRA User Knowledge Base Query Client - Retrieve encrypted user preferences, identity, likings, and dislikes."
    )
    parser.add_argument("--all", action="store_true", help="Display all knowledge base records.")
    parser.add_argument("--profile", action="store_true", help="Display user profile and identity.")
    parser.add_argument("--preferences", "--prefs", action="store_true", help="Display all user preferences.")
    parser.add_argument("--likes", "--likings", action="store_true", help="Display items the user likes, loves, and prefers.")
    parser.add_argument("--dislikes", "--hateings", "--hates", action="store_true", help="Display items the user dislikes, hates, and avoids.")
    parser.add_argument("--music", action="store_true", help="Display music tastes and favorite artists.")
    parser.add_argument("--viewing", action="store_true", help="Display viewing interests (anime, movies, shows).")
    parser.add_argument("--sports", action="store_true", help="Display sports interests and favorite teams.")
    parser.add_argument("--search", type=str, metavar="QUERY", help="Search knowledge base using FTS5 index.")
    parser.add_argument("--summary", action="store_true", help="Print concise LLM prompt context summary.")
    parser.add_argument("--json", action="store_true", help="Output raw JSON format.")

    args = parser.parse_args()

    # Default to --all if no specific view flags were given
    no_flags = not any([
        args.all, args.profile, args.preferences, args.likes, args.dislikes,
        args.music, args.viewing, args.sports, args.search, args.summary
    ])

    if args.json:
        if args.search:
            res = search_user_knowledge(args.search)
            print(json.dumps(res, indent=2))
        elif args.profile:
            print(json.dumps(get_user_profile(), indent=2))
        elif args.likes:
            print(json.dumps(get_user_likings(), indent=2))
        elif args.dislikes:
            print(json.dumps(get_user_dislikes(), indent=2))
        elif args.preferences:
            print(json.dumps(get_user_preferences(), indent=2))
        elif args.music:
            print(json.dumps(get_music_preferences(), indent=2))
        elif args.viewing:
            print(json.dumps(get_viewing_interests(), indent=2))
        elif args.sports:
            print(json.dumps(get_sports_interests(), indent=2))
        else:
            print(json.dumps(get_complete_knowledge_base(), indent=2))
        return

    if args.search:
        results = search_user_knowledge(args.search)
        print(f"\n=== Search Results for '{args.search}' ({len(results)} matches) ===")
        for i, r in enumerate(results, 1):
            category = r.get("_category") or r.get("category", "")
            title = r.get("title") or r.get("item", "")
            details = r.get("details", "")
            print(f"  {i}. [{category.upper()}] {title} - {details}")
        return

    if args.summary:
        print("\n=== LLM Prompt Context Summary ===")
        summary = get_user_summary_for_llm()
        print(summary if summary else "  (No user context available)")
        return

    if args.profile or args.all or no_flags:
        prof = get_user_profile()
        print("\n=== User Identity & Profile ===")
        if prof:
            for k, v in prof.items():
                print(f"  {k}: {v}")
        else:
            print("  (Profile empty or not synced yet)")

    if args.likes or args.all or no_flags:
        likes = get_user_likings()
        _print_table("Likings (Likes & Favorites)", likes, ["item", "category", "confidence", "details"])

    if args.dislikes or args.all or no_flags:
        dislikes = get_user_dislikes()
        _print_table("Hateings (Dislikes & Avoids)", dislikes, ["item", "category", "confidence", "details"])

    if args.preferences and not (args.likes or args.dislikes or args.all or no_flags):
        prefs = get_user_preferences(status="active")
        _print_table("All Preferences", prefs, ["item", "category", "preference_type", "confidence", "details"])

    if args.music or args.all or no_flags:
        music = get_music_preferences(status="active")
        _print_table("Music Preferences", music, ["artist", "genre", "track", "platform", "confidence"])

    if args.viewing or args.all or no_flags:
        views = get_viewing_interests(status="current")
        _print_table("Current Viewing Interests", views, ["title", "media_type", "platform", "confidence"])

    if args.sports or args.all or no_flags:
        sports = get_sports_interests(status="active")
        _print_table("Sports Interests", sports, ["sport_name", "teams_or_players", "interest_level"])


if __name__ == "__main__":
    main()
