# MIRA User Knowledge Base

The **User Knowledge Base** is a specialized, secure, and privacy-preserving memory submodule within MIRA's **Engine**. It maintains a continuously updated, encrypted mental model of the user as an individual—their identity, likings, and hateings/dislikes—without ever storing routine desktop activities, screen events, raw chat messages, or Redis jobs.

---

## 1. Distinction from Activity Knowledge Base

| Characteristic | User Knowledge Base (`user_knowledge_base`) | Activity Knowledge Base (`activity_knowledge_base`) |
| :--- | :--- | :--- |
| **Primary Purpose** | Personal profile, likings, hateings, and personal tastes. | Desktop activity monitoring, work history, and screen capture. |
| **What is Stored** | What the user **likes**, **loves**, **dislikes**, **hates**, musical tastes, anime/shows followed, and favorite sports. | Applications used, windows opened, OCR screen text, files browsed, routine tasks. |
| **Clean & To-the-Point** | Highly distilled facts. No routine desktop noise. | Continuous timeline of work sessions, activities, and frames. |
| **Storage Engine** | In-memory SQLite with XChaCha20-Poly1305 encryption on disk (`Vault/system/user_knowledge_base.enc`). | Vector database / Chroma / Activity SQLite store. |

---

## 2. What This Knowledge Base Contains

The User Knowledge Base stores **only required, distilled personal information**:

| Domain | Table Name | Content Description | Examples |
| :--- | :--- | :--- | :--- |
| **User Identity** | `user_identity` | Profile attributes synchronized from Vault. | Name: `Dhiraj`, City: `Pune`, Country: `India` |
| **Likings** | `preferences` (`preference_type='like'`) | Distilled likes, loves, favorite tools, coding styles, and workflows. | `Python` (like), `Dark Mode` (like), `FastAPI` (like) |
| **Hateings / Dislikes** | `preferences` (`preference_type='dislike'`) | Distilled dislikes, hates, pet peeves, and avoided tools or styles. | `Light Mode` (dislike), `PHP` (dislike), `Jira` (dislike) |
| **Music Tastes** | `music_preferences` | Preferred artists, genres, tracks, and listening platforms. | Artist: `Queen`, Genre: `Rock`, Platform: `Spotify` |
| **Viewing Interests** | `viewing_interests` | Movies, anime, TV series, or YouTube topics watched or tracked. | Title: `Attack on Titan`, Media: `anime`, Status: `current` |
| **Sports Interests** | `sports_interests` | Favorite sports, teams, players, and engagement level. | Sport: `cricket`, Teams: `India, CSK`, Level: `high` |

### Key Semantic Attributes on Records
- **`status`**: `active` or `past` (superseded by a newer contradictory preference).
- **`confidence`**: `inference` (observed once or twice) or `explicit_fact` (stated directly or confirmed 3+ times).
- **`observation_count`**: Number of times the habit or preference has been observed.
- **`last_observed`**: ISO 8601 UTC timestamp of the most recent observation.

---

## 3. Security, Privacy & Storage Architecture

1. **Zero Message & Job Storage**:
   - No `processed_jobs` or `raw_messages` tables exist in the database.
   - In-flight deduplication is handled exclusively in memory using a bounded LRU queue (`maxlen=2000`).
   - Processed jobs are acknowledged and deleted from Redis Stream via the Message Broker API.

2. **Authenticated AEAD Encryption (XChaCha20-Poly1305)**:
   - On disk, data is persisted as a single encrypted file: `Vault/system/user_knowledge_base.enc`.
   - The file begins with magic header `MIRAKB01` followed by a random 24-byte nonce, ciphertext, and a 16-byte Poly1305 MAC tag.
   - Any modification or tampering causes immediate verification failure (`IntegrityVerificationError`).

3. **OS Credential Store Key Derivation**:
   - The master 256-bit encryption key is securely stored in Windows Credential Manager under the `MIRA_VAULT` service (`master_encryption_key`).

4. **Exclusive OS File Locking**:
   - The encrypted file is locked with a non-blocking Windows OS lock (`msvcrt.locking(..., LK_NBLCK, 1)`).
   - Restrictive NTFS Access Control Lists (`icacls`) restrict file access exclusively to the active Windows user account.

5. **In-Memory RAM Performance with WAL**:
   - The database runs entirely in memory (`:memory:`) via SQLite deserialization/serialization.
   - All queries and lookups execute with sub-millisecond latency and zero disk I/O.

6. **SQLite FTS5 Full-Text Search**:
   - Built-in `kb_fts` virtual table enables instant ranked keyword and prefix lookups across likes, dislikes, music, viewing, and sports.

7. **Automatic Contradiction Resolution**:
   - If a user changes preferences (e.g. switches from Dark Mode to Light Mode), the older preference is marked `status = 'past'` and the new preference is recorded as `status = 'active'`.

---

## 4. How to Get This Data in Other Scripts

We provide high-level, reusable helper functions in [client.py](file:///e:/FullStack/Mira/Engine/user_knowledge_base/client.py). Any script in Engine, Vault, Memory, or tests can import these functions directly.

### Quick Import Example

```python
from Engine.user_knowledge_base.client import (
    get_user_profile,
    get_user_likings,
    get_user_dislikes,
    get_user_preferences,
    get_music_preferences,
    get_viewing_interests,
    get_sports_interests,
    search_user_knowledge,
    get_user_summary_for_llm,
    get_complete_knowledge_base,
)

# 1. Fetch user identity
profile = get_user_profile()
print(f"Hello, {profile.get('user_name')} from {profile.get('city')}")

# 2. Fetch user likings (likes, loves, preferences)
likes = get_user_likings(category="tech")
for pref in likes:
    print(f"Likes: {pref['item']} ({pref['confidence']})")

# 3. Fetch user hateings (dislikes, hates, avoided tools)
dislikes = get_user_dislikes(category="tech")
for hate in dislikes:
    print(f"Dislikes: {hate['item']} ({hate['confidence']})")

# 4. Instant search across all domains (FTS5)
matches = search_user_knowledge("python", limit=5)
for match in matches:
    print(f"Match [{match['category']}]: {match['title']} - {match['details']}")

# 5. Generate ready-to-use LLM system prompt context
llm_context = get_user_summary_for_llm()
print(llm_context)
```

---

## 5. Function Reference ([client.py](file:///e:/FullStack/Mira/Engine/user_knowledge_base/client.py))

| Function | Parameters | Description |
| :--- | :--- | :--- |
| `get_user_profile()` | `enc_path=None` | Returns user identity dictionary (`user_name`, `email`, `city`, `state`, `country`). |
| `get_user_likings()` | `category=None`, `enc_path=None` | Returns items, tools, styles, and habits the user explicitly likes or loves. |
| `get_user_dislikes()` | `category=None`, `enc_path=None` | Returns items, tools, styles, and habits the user explicitly dislikes, hates, or avoids. |
| `get_user_preferences()` | `category=None`, `preference_type=None`, `status="active"`, `enc_path=None` | Returns all distilled preferences. Filterable by category or type (`like`/`dislike`). |
| `get_music_preferences()` | `status="active"`, `genre=None`, `platform=None`, `enc_path=None` | Returns favorite artists, genres, tracks, and listening platforms. |
| `get_viewing_interests()` | `status="current"`, `media_type=None`, `enc_path=None` | Returns anime, movies, series, or YouTube topics being followed. |
| `get_sports_interests()` | `status="active"`, `sport_name=None`, `enc_path=None` | Returns sports interests, favorite teams, and engagement level. |
| `search_user_knowledge()` | `query: str`, `limit: int = 5`, `category=None`, `enc_path=None` | Performs sub-millisecond full-text search across all domains using SQLite FTS5 index. |
| `get_user_summary_for_llm()` | `max_items_per_category: int = 5`, `enc_path=None` | Formats active user profile, likes, and dislikes into a concise context string for LLM prompts. |
| `get_complete_knowledge_base()` | `enc_path=None` | Returns the entire structured snapshot including all tables and stats. |

---

## 6. Command-Line Interface (CLI Script)

The client script can also be executed directly from your terminal to inspect or search the Knowledge Base:

```powershell
# Display all active records formatted in neat tables
python Engine/user_knowledge_base/client.py --all

# Display user profile / identity
python Engine/user_knowledge_base/client.py --profile

# Display user likings (likes & favorites)
python Engine/user_knowledge_base/client.py --likes

# Display user hateings (dislikes & avoids)
python Engine/user_knowledge_base/client.py --dislikes

# Search the knowledge base for keywords (FTS5 search)
python Engine/user_knowledge_base/client.py --search "python"

# Print concise LLM prompt context string
python Engine/user_knowledge_base/client.py --summary

# Output complete data in JSON format
python Engine/user_knowledge_base/client.py --all --json
```

---

## 7. REST API Endpoints (Engine)

When Engine is running on port `9007`, the following HTTP endpoints are available:

- **`GET /user-knowledge-base`**: Returns the complete structured Knowledge Base in JSON (including dedicated `likes` and `dislikes` arrays).
- **`GET /user-knowledge-base/status`**: Returns worker status, batch size, polling intervals, and processing statistics.
- **`POST /user-knowledge-base/sync`**: Synchronizes user identity from Vault's `user` table immediately.
- **`POST /user-knowledge-base/start`**: Starts the parallel background extraction workers.
- **`POST /user-knowledge-base/stop`**: Stops the background workers.
- **`DELETE /user-knowledge-base`**: Clears user preferences, music, viewing, and sports records while keeping identity intact.
- **`DELETE /user-knowledge-base/record/{category}/{record_id}`**: Deletes a specific individual knowledge record.
