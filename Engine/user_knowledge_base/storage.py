from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import (
    cleanup_legacy_plaintext_files,
    get_kb_enc_path,
)
from .crypto import (
    IntegrityVerificationError,
    decrypt_kb_data,
    encrypt_kb_data,
    lock_kb_file,
    unlock_kb_file,
)
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.user_knowledge_base.storage")

_DB_LOCK = threading.RLock()
_MEM_CONN: Optional[sqlite3.Connection] = None
_CACHE_SUMMARY: Optional[Dict[str, Any]] = None
_CACHE_TIMESTAMP: float = 0.0


def _normalize(val: Optional[str]) -> str:
    if not val:
        return ""
    return str(val).strip().lower()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """
    Ensure the minimal, required-data-only schema and FTS5 search index exist.
    Stores NO jobs, NO raw messages, and NO captured screen text.
    """
    with conn:
        conn.executescript(
            """
            -- User Profile / Identity (strictly required identity fields from Vault)
            CREATE TABLE IF NOT EXISTS user_identity (
                id INTEGER PRIMARY KEY,
                user_name TEXT DEFAULT '',
                email TEXT DEFAULT '',
                phone_number TEXT DEFAULT '',
                city TEXT DEFAULT '',
                state TEXT DEFAULT '',
                country TEXT DEFAULT '',
                last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Distilled User Preferences (likes, dislikes, hobbies, preferences)
            CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,                -- tech, food, lifestyle, gaming, hobby, work, general
                item TEXT NOT NULL,                    -- distilled item name
                normalized_item TEXT NOT NULL,         -- lowercased stripped for fast index lookup
                preference_type TEXT NOT NULL,         -- 'like', 'dislike', 'hobby', 'preference'
                status TEXT NOT NULL DEFAULT 'active', -- 'active', 'past'
                confidence TEXT NOT NULL DEFAULT 'inference', -- 'explicit_fact', 'inference'
                details TEXT DEFAULT '',               -- concise summary detail (max 100 chars)
                platform TEXT DEFAULT '',              -- platform/app
                observation_count INTEGER DEFAULT 1,
                last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pref_lookup ON preferences(category, normalized_item, status);
            CREATE INDEX IF NOT EXISTS idx_pref_status ON preferences(status);

            -- Distilled Music Preferences
            CREATE TABLE IF NOT EXISTS music_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                genre TEXT DEFAULT '',
                artist TEXT DEFAULT '',
                track TEXT DEFAULT '',
                platform TEXT DEFAULT '',              -- Spotify, YouTube Music, Apple Music
                normalized_key TEXT NOT NULL,          -- artist:genre:platform
                status TEXT NOT NULL DEFAULT 'active', -- 'active', 'past'
                confidence TEXT NOT NULL DEFAULT 'inference',
                details TEXT DEFAULT '',
                observation_count INTEGER DEFAULT 1,
                last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_music_lookup ON music_preferences(normalized_key, status);

            -- Distilled Viewing Interests
            CREATE TABLE IF NOT EXISTS viewing_interests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_type TEXT NOT NULL,              -- movie, anime, comedy, youtube, tv_series, other
                title TEXT NOT NULL,
                normalized_title TEXT NOT NULL,
                platform TEXT DEFAULT '',              -- YouTube, Netflix, Crunchyroll
                status TEXT NOT NULL DEFAULT 'current',-- current, completed, interested, past
                confidence TEXT NOT NULL DEFAULT 'inference',
                details TEXT DEFAULT '',
                observation_count INTEGER DEFAULT 1,
                last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_viewing_lookup ON viewing_interests(media_type, normalized_title, status);

            -- Distilled Sports Interests
            CREATE TABLE IF NOT EXISTS sports_interests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sport_name TEXT NOT NULL,              -- cricket, football, tennis, other
                teams_or_players TEXT DEFAULT '',
                normalized_sport TEXT NOT NULL,
                interest_level TEXT DEFAULT 'moderate',-- high, moderate, casual
                status TEXT NOT NULL DEFAULT 'active', -- 'active', 'past'
                confidence TEXT NOT NULL DEFAULT 'inference',
                details TEXT DEFAULT '',
                observation_count INTEGER DEFAULT 1,
                last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_sports_lookup ON sports_interests(normalized_sport, status);

            -- Drop legacy activities table if it exists (activities belong in Activity KB, not User KB)
            DROP TABLE IF EXISTS life_and_activities;

            -- FTS5 Full-Text Search Table for Ultra-Fast Microsecond Lookups
            CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
                entity_type,
                category,
                title,
                details,
                tokenize = 'porter unicode61'
            );
            """
        )


def _rebuild_fts_index(conn: sqlite3.Connection) -> None:
    """Synchronize the fast FTS5 search index with current active records."""
    try:
        with conn:
            conn.execute("DELETE FROM kb_fts")
            conn.execute(
                """
                INSERT INTO kb_fts (entity_type, category, title, details)
                SELECT 'preferences', category, item, details FROM preferences WHERE status = 'active'
                UNION ALL
                SELECT 'music', platform, (artist || ' ' || genre || ' ' || track), details FROM music_preferences WHERE status = 'active'
                UNION ALL
                SELECT 'viewing', media_type, (title || ' ' || platform), details FROM viewing_interests WHERE status = 'current'
                UNION ALL
                SELECT 'sports', sport_name, (teams_or_players || ' ' || interest_level), details FROM sports_interests WHERE status = 'active';
                """
            )
    except Exception as e:
        logger.debug(f"FTS5 rebuild notice: {e}")


def _save_encrypted_database(enc_path: Optional[Path] = None) -> bool:
    """
    Serialize the in-memory SQLite database, encrypt with XChaCha20-Poly1305,
    and atomically persist to the encrypted file on disk.
    """
    global _MEM_CONN
    if _MEM_CONN is None:
        return False
    target_path = enc_path or get_kb_enc_path()
    target_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Unlock previous lock temporarily to write the new version
        unlock_kb_file(target_path)

        raw_bytes = _MEM_CONN.serialize()
        encrypted_bytes = encrypt_kb_data(raw_bytes)

        temp_path = target_path.with_suffix(".enc.tmp")
        temp_path.write_bytes(encrypted_bytes)
        temp_path.replace(target_path)

        # Acquire exclusive OS file lock on the encrypted file
        lock_kb_file(target_path)
        return True
    except Exception as e:
        log_error(f"[UserKnowledgeBase] Failed to save encrypted database to {target_path}: {e}")
        return False


def _load_encrypted_database(enc_path: Optional[Path] = None) -> sqlite3.Connection:
    """
    Load and decrypt the Knowledge Base from disk into an in-memory SQLite connection.
    Verifies cryptographic integrity with Poly1305 MAC.
    """
    target_path = enc_path or get_kb_enc_path()
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row

    if target_path.exists() and target_path.stat().st_size > 0:
        try:
            encrypted_bytes = target_path.read_bytes()
            if encrypted_bytes:
                decrypted_bytes = decrypt_kb_data(encrypted_bytes)
                conn.deserialize(decrypted_bytes)
                log(f"[UserKnowledgeBase] Loaded and decrypted Knowledge Base ({len(encrypted_bytes)} bytes) from: {target_path}")
        except IntegrityVerificationError as ive:
            log_error(f"[UserKnowledgeBase] CRITICAL: Cryptographic verification failed! Tampering detected: {ive}")
            raise
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Could not decrypt existing database ({e}). Initializing fresh encrypted store.")

    _ensure_schema(conn)
    _rebuild_fts_index(conn)
    lock_kb_file(target_path)
    return conn


def check_kb_exists(enc_path: Optional[Path] = None) -> bool:
    """
    Check whether the encrypted user Knowledge Base exists on disk.
    """
    target = enc_path or get_kb_enc_path()
    return target.exists() and target.stat().st_size > 40


def init_kb(force_create: bool = False, enc_path: Optional[Path] = None) -> bool:
    """
    Initialize the encrypted Knowledge Base.
    - Cleans up any legacy plaintext databases or JSON files.
    - Decrypts and deserializes into an ultra-fast in-memory database.
    - Locks the file with an exclusive OS lock.
    """
    global _MEM_CONN, _CACHE_SUMMARY, _CACHE_TIMESTAMP
    target = enc_path or get_kb_enc_path()

    with _DB_LOCK:
        # 1. Clean up legacy unencrypted plaintext files
        cleanup_legacy_plaintext_files()

        if _MEM_CONN is not None and not force_create:
            return True

        try:
            _MEM_CONN = _load_encrypted_database(target)
            _CACHE_SUMMARY = None
            _CACHE_TIMESTAMP = 0.0

            # If it was a new creation, persist the initial encrypted shell immediately
            if not target.exists() or target.stat().st_size == 0 or force_create:
                _save_encrypted_database(target)

            log(f"[UserKnowledgeBase] Encrypted Knowledge Base is active and secure.")
            return True
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Failed to initialize encrypted Knowledge Base: {e}")
            return False


def close_kb(enc_path: Optional[Path] = None) -> None:
    """
    Close the in-memory database and release the exclusive OS file lock.
    """
    global _MEM_CONN, _CACHE_SUMMARY, _CACHE_TIMESTAMP
    with _DB_LOCK:
        if _MEM_CONN is not None:
            try:
                _MEM_CONN.close()
            except Exception:
                pass
            _MEM_CONN = None
        _CACHE_SUMMARY = None
        _CACHE_TIMESTAMP = 0.0
        target = enc_path or get_kb_enc_path()
        unlock_kb_file(target)


def get_kb_connection(enc_path: Optional[Path] = None) -> sqlite3.Connection:
    """
    Retrieve active in-memory connection for querying and schema verification.
    """
    return _get_connection(enc_path)


def _get_connection(enc_path: Optional[Path] = None) -> sqlite3.Connection:
    global _MEM_CONN
    if _MEM_CONN is None:
        init_kb(enc_path=enc_path)
    if _MEM_CONN is None:
        raise RuntimeError("Knowledge Base memory connection is not initialized.")
    return _MEM_CONN


def update_user_identity(user_data: Dict[str, Any], enc_path: Optional[Path] = None) -> bool:
    """
    Update user identity in the encrypted Knowledge Base.
    Stores ONLY the required user profile attributes.
    """
    if not isinstance(user_data, dict):
        return False

    u_name = str(user_data.get("user_name") or "").strip()
    email = str(user_data.get("email") or "").strip()
    phone = str(user_data.get("phone_number") or "").strip()
    city = str(user_data.get("city") or "").strip()
    state = str(user_data.get("state") or "").strip()
    country = str(user_data.get("country") or "").strip()

    if not any([u_name, email, phone, city, state, country]):
        return False

    global _CACHE_SUMMARY
    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            with conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM user_identity LIMIT 1")
                row = cursor.fetchone()
                now_str = datetime.now(timezone.utc).isoformat()
                if row:
                    cursor.execute(
                        """
                        UPDATE user_identity
                        SET user_name = ?, email = ?, phone_number = ?, city = ?, state = ?, country = ?, last_synced = ?
                        WHERE id = ?
                        """,
                        (u_name, email, phone, city, state, country, now_str, row["id"]),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO user_identity (user_name, email, phone_number, city, state, country, last_synced)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (u_name, email, phone, city, state, country, now_str),
                    )

            _CACHE_SUMMARY = None
            _save_encrypted_database(enc_path)
            log(f"[UserKnowledgeBase] Updated user identity in encrypted Knowledge Base: {u_name}")
            return True
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Error updating user identity: {e}")
            return False


def get_user_identity(enc_path: Optional[Path] = None) -> Dict[str, Any]:
    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT user_name, email, phone_number, city, state, country, last_synced FROM user_identity LIMIT 1")
            row = cursor.fetchone()
            return dict(row) if row else {}
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Error retrieving user identity: {e}")
            return {}


def save_extracted_batch(
    extracted_data: Dict[str, Any],
    job_ids: Optional[List[str]] = None,
    app_names: Optional[List[str]] = None,
    enc_path: Optional[Path] = None,
) -> Dict[str, int]:
    """
    Store extracted information into the encrypted in-memory Knowledge Base.
    - Stores ONLY required distilled fields (no raw messages, no OCR evidence, no jobs).
    - Detects contradictions: marks old conflicting records as 'past', keeps active as current.
    - Elevates inference to explicit_fact after repeated observations.
    - Commits and serializes into encrypted file on disk.
    """
    stats = {
        "preferences_added": 0,
        "preferences_updated": 0,
        "music_added": 0,
        "music_updated": 0,
        "viewing_added": 0,
        "viewing_updated": 0,
        "sports_added": 0,
        "sports_updated": 0,
    }

    if not isinstance(extracted_data, dict):
        return stats

    global _CACHE_SUMMARY
    now_str = datetime.now(timezone.utc).isoformat()

    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            with conn:
                cursor = conn.cursor()

                # 1. Preferences (Likings and Hateings / Dislikes)
                for item_dict in extracted_data.get("preferences", []):
                    if not isinstance(item_dict, dict):
                        continue
                    item_name = str(item_dict.get("item") or "").strip()
                    if not item_name:
                        continue
                    category = str(item_dict.get("category") or "general").strip().lower()
                    raw_type = str(item_dict.get("preference_type") or "like").strip().lower()
                    pref_type = "dislike" if raw_type in ("dislike", "hate", "avoid", "dislikes", "hates") else "like"
                    confidence = str(item_dict.get("confidence") or "inference").strip().lower()
                    if confidence not in ("explicit_fact", "inference"):
                        confidence = "inference"
                    details = str(item_dict.get("details") or "").strip()[:80]
                    platform = str(item_dict.get("platform") or "").strip()[:50]
                    norm_item = _normalize(item_name)

                    cursor.execute(
                        "SELECT id, preference_type, confidence, observation_count FROM preferences WHERE category = ? AND normalized_item = ? AND status = 'active'",
                        (category, norm_item),
                    )
                    active_row = cursor.fetchone()

                    if active_row:
                        existing_type = active_row["preference_type"].lower()
                        is_contradiction = (
                            (existing_type == "like" and pref_type == "dislike")
                            or (existing_type == "dislike" and pref_type == "like")
                        )

                        if is_contradiction:
                            # Contradiction: mark outdated preference as 'past'
                            cursor.execute("UPDATE preferences SET status = 'past' WHERE id = ?", (active_row["id"],))
                            cursor.execute(
                                """
                                INSERT INTO preferences (category, item, normalized_item, preference_type, status, confidence, details, platform, observation_count, last_observed)
                                VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 1, ?)
                                """,
                                (category, item_name, norm_item, pref_type, confidence, details, platform, now_str),
                            )
                            stats["preferences_added"] += 1
                        else:
                            # Confirming evidence: increment observation count
                            new_count = active_row["observation_count"] + 1
                            new_conf = "explicit_fact" if (confidence == "explicit_fact" or new_count >= 3) else active_row["confidence"]
                            cursor.execute(
                                """
                                UPDATE preferences
                                SET last_observed = ?, observation_count = ?, confidence = ?, details = ?
                                WHERE id = ?
                                """,
                                (now_str, new_count, new_conf, details or "", active_row["id"]),
                            )
                            stats["preferences_updated"] += 1
                    else:
                        cursor.execute(
                            """
                            INSERT INTO preferences (category, item, normalized_item, preference_type, status, confidence, details, platform, observation_count, last_observed)
                            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 1, ?)
                            """,
                            (category, item_name, norm_item, pref_type, confidence, details, platform, now_str),
                        )
                        stats["preferences_added"] += 1

                # 2. Music Preferences
                for m_dict in extracted_data.get("music_preferences", []):
                    if not isinstance(m_dict, dict):
                        continue
                    genre = str(m_dict.get("genre") or "").strip()[:50]
                    artist = str(m_dict.get("artist") or "").strip()[:50]
                    track = str(m_dict.get("track") or m_dict.get("track_or_album") or "").strip()[:60]
                    platform = str(m_dict.get("platform") or "").strip()[:40]
                    confidence = str(m_dict.get("confidence") or "inference").strip().lower()
                    if confidence not in ("explicit_fact", "inference"):
                        confidence = "inference"
                    details = str(m_dict.get("details") or "").strip()[:100]

                    norm_key = _normalize(f"{artist}:{genre}:{platform}")
                    if not norm_key or norm_key == "::":
                        norm_key = _normalize(track or artist or genre)
                    if not norm_key:
                        continue

                    cursor.execute(
                        "SELECT id, observation_count, confidence FROM music_preferences WHERE normalized_key = ? AND status = 'active'",
                        (norm_key,),
                    )
                    active_music = cursor.fetchone()
                    if active_music:
                        new_count = active_music["observation_count"] + 1
                        new_conf = "explicit_fact" if (confidence == "explicit_fact" or new_count >= 3) else active_music["confidence"]
                        cursor.execute(
                            "UPDATE music_preferences SET last_observed = ?, observation_count = ?, confidence = ?, details = ? WHERE id = ?",
                            (now_str, new_count, new_conf, details or "", active_music["id"]),
                        )
                        stats["music_updated"] += 1
                    else:
                        cursor.execute(
                            """
                            INSERT INTO music_preferences (genre, artist, track, platform, normalized_key, status, confidence, details, observation_count, last_observed)
                            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 1, ?)
                            """,
                            (genre, artist, track, platform, norm_key, confidence, details, now_str),
                        )
                        stats["music_added"] += 1

                # 3. Viewing Interests
                for v_dict in extracted_data.get("viewing_interests", []):
                    if not isinstance(v_dict, dict):
                        continue
                    m_type = str(v_dict.get("media_type") or "other").strip().lower()[:30]
                    title = str(v_dict.get("title") or v_dict.get("title_or_topic") or "").strip()
                    if not title:
                        continue
                    norm_title = _normalize(title)
                    platform = str(v_dict.get("platform") or "").strip()[:40]
                    v_status = str(v_dict.get("status") or "current").strip().lower()
                    if v_status not in ("current", "completed", "interested", "past"):
                        v_status = "current"
                    confidence = str(v_dict.get("confidence") or "inference").strip().lower()
                    if confidence not in ("explicit_fact", "inference"):
                        confidence = "inference"
                    details = str(v_dict.get("details") or "").strip()[:100]

                    cursor.execute(
                        "SELECT id, observation_count, confidence FROM viewing_interests WHERE media_type = ? AND normalized_title = ?",
                        (m_type, norm_title),
                    )
                    existing_view = cursor.fetchone()
                    if existing_view:
                        new_count = existing_view["observation_count"] + 1
                        new_conf = "explicit_fact" if (confidence == "explicit_fact" or new_count >= 3) else existing_view["confidence"]
                        cursor.execute(
                            "UPDATE viewing_interests SET status = ?, last_observed = ?, observation_count = ?, confidence = ?, details = ? WHERE id = ?",
                            (v_status, now_str, new_count, new_conf, details or "", existing_view["id"]),
                        )
                        stats["viewing_updated"] += 1
                    else:
                        cursor.execute(
                            """
                            INSERT INTO viewing_interests (media_type, title, normalized_title, platform, status, confidence, details, observation_count, last_observed)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                            """,
                            (m_type, title, norm_title, platform, v_status, confidence, details, now_str),
                        )
                        stats["viewing_added"] += 1

                # 4. Sports Interests
                for s_dict in extracted_data.get("sports_interests", []):
                    if not isinstance(s_dict, dict):
                        continue
                    sport_name = str(s_dict.get("sport_name") or "").strip()[:40]
                    if not sport_name:
                        continue
                    norm_sport = _normalize(sport_name)
                    teams = str(s_dict.get("teams_or_players") or "").strip()[:80]
                    interest = str(s_dict.get("interest_level") or "moderate").strip().lower()
                    confidence = str(s_dict.get("confidence") or "inference").strip().lower()
                    if confidence not in ("explicit_fact", "inference"):
                        confidence = "inference"
                    details = str(s_dict.get("details") or "").strip()[:100]

                    cursor.execute(
                        "SELECT id, teams_or_players, observation_count, confidence FROM sports_interests WHERE normalized_sport = ? AND status = 'active'",
                        (norm_sport,),
                    )
                    active_sport = cursor.fetchone()
                    if active_sport:
                        new_count = active_sport["observation_count"] + 1
                        new_conf = "explicit_fact" if (confidence == "explicit_fact" or new_count >= 3) else active_sport["confidence"]
                        merged_teams = (
                            f"{active_sport['teams_or_players']}, {teams}"
                            if teams and teams not in active_sport["teams_or_players"]
                            else (teams or active_sport["teams_or_players"])
                        )
                        cursor.execute(
                            "UPDATE sports_interests SET teams_or_players = ?, interest_level = ?, last_observed = ?, observation_count = ?, confidence = ?, details = ? WHERE id = ?",
                            (merged_teams, interest, now_str, new_count, new_conf, details or "", active_sport["id"]),
                        )
                        stats["sports_updated"] += 1
                    else:
                        cursor.execute(
                            """
                            INSERT INTO sports_interests (sport_name, teams_or_players, normalized_sport, interest_level, status, confidence, details, observation_count, last_observed)
                            VALUES (?, ?, ?, ?, 'active', ?, ?, 1, ?)
                            """,
                            (sport_name, teams, norm_sport, interest, confidence, details, now_str),
                        )
                        stats["sports_added"] += 1



                _rebuild_fts_index(conn)

            # Invalidate in-memory lookup cache and persist to encrypted file
            _CACHE_SUMMARY = None
            _save_encrypted_database(enc_path)
            log(f"[UserKnowledgeBase] Encrypted batch saved. Stats: {stats}")
            return stats
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Error saving batch: {e}")
            raise


def search_knowledge_base(
    query: str, category: Optional[str] = None, limit: int = 20, enc_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """
    Blazing fast, ranked full-text search across the Knowledge Base using FTS5.
    Executes in microseconds in memory.
    """
    if not query or not query.strip():
        kb = get_full_knowledge_base(enc_path)
        all_items: List[Dict[str, Any]] = []
        for cat_key in ("preferences", "music_preferences", "viewing_interests", "sports_interests", "life_and_activities"):
            for item in kb.get(cat_key, []):
                all_items.append({**item, "_category": cat_key})
        return all_items[:limit]

    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            cursor = conn.cursor()
            clean_q = query.strip().replace("'", "").replace('"', "")
            terms = [t for t in clean_q.split() if t]
            if not terms:
                return []

            # Try exact / prefix FTS5 search
            fts_query = " ".join([f"{t}*" for t in terms])
            try:
                cursor.execute(
                    """
                    SELECT entity_type, category, title, details, rank
                    FROM kb_fts
                    WHERE kb_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                    """,
                    (fts_query, limit),
                )
                fts_rows = cursor.fetchall()
                if fts_rows:
                    return [
                        {
                            "_category": r["entity_type"],
                            "category": r["category"],
                            "sport_name": r["category"] if r["entity_type"] == "sports" else "",
                            "item": r["title"],
                            "title": r["title"],
                            "details": r["details"],
                        }
                        for r in fts_rows
                    ]
            except Exception:
                pass

            # Fast LIKE fallback on indexed columns
            wildcard = f"%{clean_q.lower()}%"
            results: List[Dict[str, Any]] = []

            if not category or category == "preferences":
                cursor.execute(
                    "SELECT item, category, preference_type, confidence, details, 'preferences' as _category FROM preferences WHERE lower(item) LIKE ? OR lower(category) LIKE ? LIMIT ?",
                    (wildcard, wildcard, limit),
                )
                results.extend([dict(r) for r in cursor.fetchall()])

            if not category or category == "sports_interests":
                cursor.execute(
                    "SELECT sport_name, teams_or_players, interest_level, 'sports_interests' as _category FROM sports_interests WHERE lower(sport_name) LIKE ? OR lower(teams_or_players) LIKE ? LIMIT ?",
                    (wildcard, wildcard, limit),
                )
                results.extend([dict(r) for r in cursor.fetchall()])

            if not category or category == "music_preferences":
                cursor.execute(
                    "SELECT artist, genre, track, platform, 'music_preferences' as _category FROM music_preferences WHERE lower(artist) LIKE ? OR lower(genre) LIKE ? LIMIT ?",
                    (wildcard, wildcard, limit),
                )
                results.extend([dict(r) for r in cursor.fetchall()])

            return results[:limit]
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Search failed for query '{query}': {e}")
            return []


def get_full_knowledge_base(enc_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Retrieve structured user knowledge base. Cached in memory for instantaneous queries.
    """
    global _CACHE_SUMMARY, _CACHE_TIMESTAMP
    with _DB_LOCK:
        if _CACHE_SUMMARY is not None and (time.time() - _CACHE_TIMESTAMP < 5.0):
            return dict(_CACHE_SUMMARY)

        conn = _get_connection(enc_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT user_name, email, phone_number, city, state, country, last_synced FROM user_identity LIMIT 1")
            user_row = cursor.fetchone()
            user_id = dict(user_row) if user_row else {}

            cursor.execute("SELECT id, category, item, preference_type, status, confidence, details, platform, observation_count, last_observed FROM preferences ORDER BY status ASC, observation_count DESC")
            preferences = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT id, genre, artist, track, platform, status, confidence, details, observation_count, last_observed FROM music_preferences ORDER BY status ASC, observation_count DESC")
            music = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT id, media_type, title, platform, status, confidence, details, observation_count, last_observed FROM viewing_interests ORDER BY status ASC, observation_count DESC")
            viewing = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT id, sport_name, teams_or_players, interest_level, status, confidence, details, observation_count, last_observed FROM sports_interests ORDER BY status ASC, observation_count DESC")
            sports = [dict(r) for r in cursor.fetchall()]

            likes = [p for p in preferences if p.get("preference_type") == "like" and p.get("status") == "active"]
            dislikes = [p for p in preferences if p.get("preference_type") == "dislike" and p.get("status") == "active"]

            summary = {
                "user_identity": user_id,
                "preferences": preferences,
                "likes": likes,
                "dislikes": dislikes,
                "music_preferences": music,
                "viewing_interests": viewing,
                "sports_interests": sports,
                "stats": {
                    "total_preferences": len(preferences),
                    "active_likes": len(likes),
                    "active_dislikes": len(dislikes),
                    "total_music": len(music),
                    "total_viewing": len(viewing),
                    "total_sports": len(sports),
                    "is_encrypted": True,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                },
            }
            _CACHE_SUMMARY = summary
            _CACHE_TIMESTAMP = time.time()
            return summary
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Error retrieving knowledge base: {e}")
            return {}


def clear_user_knowledge_base(enc_path: Optional[Path] = None, clear_identity: bool = False) -> bool:
    """
    Delete all extracted user knowledge base records (preferences, music, viewing, sports, activities).
    Optionally also clears user identity. Persists updated state encrypted to disk.
    """
    global _CACHE_SUMMARY, _CACHE_TIMESTAMP
    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            with conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM preferences")
                cursor.execute("DELETE FROM music_preferences")
                cursor.execute("DELETE FROM viewing_interests")
                cursor.execute("DELETE FROM sports_interests")
                if clear_identity:
                    cursor.execute("DELETE FROM user_identity")
                cursor.execute("DELETE FROM kb_fts")

            _CACHE_SUMMARY = None
            _CACHE_TIMESTAMP = 0.0
            _save_encrypted_database(enc_path)
            log("[UserKnowledgeBase] All User Knowledge Base records cleared and encrypted store updated.")
            return True
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Failed to clear User Knowledge Base: {e}")
            return False


def delete_knowledge_base_record(category: str, record_id: int, enc_path: Optional[Path] = None) -> bool:
    """
    Delete a specific record from the knowledge base by category and record ID.
    Valid categories: 'preferences', 'music', 'viewing', 'sports', 'activities'
    """
    table_map = {
        "preferences": "preferences",
        "preference": "preferences",
        "music": "music_preferences",
        "music_preferences": "music_preferences",
        "viewing": "viewing_interests",
        "viewing_interests": "viewing_interests",
        "sports": "sports_interests",
        "sports_interests": "sports_interests",
        "activities": "life_and_activities",
        "life_and_activities": "life_and_activities",
    }
    table_name = table_map.get(str(category).strip().lower())
    if not table_name:
        return False

    global _CACHE_SUMMARY, _CACHE_TIMESTAMP
    with _DB_LOCK:
        conn = _get_connection(enc_path)
        try:
            with conn:
                cursor = conn.cursor()
                cursor.execute(f"DELETE FROM {table_name} WHERE id = ?", (int(record_id),))
                _rebuild_fts_index(conn)

            _CACHE_SUMMARY = None
            _CACHE_TIMESTAMP = 0.0
            _save_encrypted_database(enc_path)
            log(f"[UserKnowledgeBase] Deleted record #{record_id} from {table_name}.")
            return True
        except Exception as e:
            log_error(f"[UserKnowledgeBase] Failed to delete record #{record_id} from {table_name}: {e}")
            return False

