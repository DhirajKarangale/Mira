from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure paths
_engine_dir = Path(__file__).resolve().parent.parent
_root_dir = _engine_dir.parent
for p in (_root_dir / "Vault", _root_dir / "Message_Broker", _root_dir / "Memory", _root_dir, _engine_dir):
    if str(p) in sys.path:
        sys.path.remove(str(p))
    sys.path.insert(0, str(p))

from user_knowledge_base.config import (
    get_kb_workers_count,
    get_kb_workers_poll_time,
    CONSUMER_KEY_USER_KB,
    DEFAULT_BATCH_SIZE,
    cleanup_legacy_plaintext_files,
)
from user_knowledge_base.crypto import (
    encrypt_kb_data,
    decrypt_kb_data,
    lock_kb_file,
    unlock_kb_file,
    IntegrityVerificationError,
    MAGIC_HEADER,
)
from user_knowledge_base.storage import (
    check_kb_exists,
    init_kb,
    close_kb,
    get_kb_connection,
    update_user_identity,
    get_user_identity,
    save_extracted_batch,
    get_full_knowledge_base,
    search_knowledge_base,
)
from user_knowledge_base.extractor import (
    extract_user_info_from_batch,
    format_jobs_batch_for_prompt,
    _clean_json_text,
)
from user_knowledge_base.worker import (
    UserKnowledgeBaseWorkerManager,
    start_user_knowledge_base,
    stop_user_knowledge_base,
    get_user_knowledge_base_status,
)
from user_knowledge_base import init_user_knowledge_base


class TestUserKnowledgeBase(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="mira_test_ukb_")
        self.enc_path = Path(self.temp_dir) / "test_user_kb.enc"

    def tearDown(self):
        try:
            close_kb(self.enc_path)
            unlock_kb_file(self.enc_path)
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        except Exception:
            pass

    # =========================================================================
    # 1. Encryption, Security, & Disk Format (Requirements 4 & 5)
    # =========================================================================

    def test_kb_encryption_and_tamper_detection(self):
        """Knowledge base on disk must be encrypted and detect tampering."""
        raw_payload = b"SQLITE_FORMAT_TEST_BYTES_AND_SECRET_DATA"
        encrypted = encrypt_kb_data(raw_payload)
        self.assertTrue(encrypted.startswith(MAGIC_HEADER))
        self.assertNotIn(b"SQLITE_FORMAT", encrypted)

        # Successful decryption
        decrypted = decrypt_kb_data(encrypted)
        self.assertEqual(decrypted, raw_payload)

        # Tampered ciphertext fails authentication (Poly1305 AEAD)
        tampered = bytearray(encrypted)
        tampered[-5] ^= 0xFF
        with self.assertRaises(IntegrityVerificationError):
            decrypt_kb_data(bytes(tampered))

    def test_file_lock_mechanism(self):
        """Exclusive file locking must prevent unauthorized access."""
        lock_file = Path(self.temp_dir) / "test.lock"
        handle = lock_kb_file(lock_file)
        self.assertIsNotNone(handle)
        # Unlocking releases handle
        unlock_kb_file(handle, lock_file)

    def test_cleanup_legacy_plaintext_files(self):
        """Purges any unencrypted legacy plaintext files."""
        sys_dir = Path(self.temp_dir)
        plain_db = sys_dir / "user_knowledge_base.db"
        plain_json = sys_dir / "user_knowledge_base.json"
        plain_db.write_text("plaintext db")
        plain_json.write_text("plaintext json")

        with patch("user_knowledge_base.config.get_system_dir", return_value=sys_dir):
            cleanup_legacy_plaintext_files()
            self.assertFalse(plain_db.exists())
            self.assertFalse(plain_json.exists())

    # =========================================================================
    # 2. Initialization and User Table Population (Requirements 2, 3, 5, 6)
    # =========================================================================

    def test_init_kb_creates_encrypted_file(self):
        """init_kb initializes an in-memory DB and writes encrypted payload to disk."""
        self.assertFalse(check_kb_exists(self.enc_path))
        success = init_kb(force_create=True, enc_path=self.enc_path)
        self.assertTrue(success)
        self.assertTrue(check_kb_exists(self.enc_path))
        self.assertTrue(self.enc_path.exists())

        # Verify disk content is encrypted, NOT plain SQLite
        unlock_kb_file(self.enc_path)
        disk_bytes = self.enc_path.read_bytes()
        self.assertTrue(disk_bytes.startswith(MAGIC_HEADER))
        self.assertNotIn(b"SQLite format 3", disk_bytes)
        lock_kb_file(self.enc_path)

    def test_update_and_get_user_identity(self):
        """Stores only strictly required user profile data from Vault."""
        init_kb(force_create=True, enc_path=self.enc_path)
        mock_user = {
            "user_name": "Dhiraj",
            "email": "dakarangale02@gmail.com",
            "phone_number": "+91 7620320595",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
        }
        success = update_user_identity(mock_user, enc_path=self.enc_path)
        self.assertTrue(success)

        identity = get_user_identity(enc_path=self.enc_path)
        self.assertEqual(identity.get("user_name"), "Dhiraj")
        self.assertEqual(identity.get("city"), "Pune")
        self.assertEqual(identity.get("country"), "India")

        # Vault update reflection
        updated_user = {
            "user_name": "Dhiraj Karangale",
            "email": "dakarangale02@gmail.com",
            "phone_number": "+91 7620320595",
            "city": "Mumbai",
            "state": "Maharashtra",
            "country": "India",
        }
        update_user_identity(updated_user, enc_path=self.enc_path)
        new_identity = get_user_identity(enc_path=self.enc_path)
        self.assertEqual(new_identity.get("user_name"), "Dhiraj Karangale")
        self.assertEqual(new_identity.get("city"), "Mumbai")

    @patch("user_knowledge_base.fetch_user_from_vault")
    @patch("user_knowledge_base.config.get_kb_enc_path")
    def test_init_user_knowledge_base_orchestration(self, mock_enc_path, mock_fetch):
        mock_enc_path.return_value = self.enc_path
        mock_fetch.return_value = {
            "user_name": "Dhiraj",
            "email": "dakarangale02@gmail.com",
            "phone_number": "+91 7620320595",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
        }
        success = init_user_knowledge_base(enc_path=self.enc_path)
        self.assertTrue(success)
        self.assertTrue(check_kb_exists(self.enc_path))
        identity = get_user_identity(enc_path=self.enc_path)
        self.assertEqual(identity.get("user_name"), "Dhiraj")

    # =========================================================================
    # 3. Required Data Only & Zero Job/Message Storage (Requirements 1 & 3)
    # =========================================================================

    def test_no_jobs_or_messages_stored_in_database(self):
        """Database schema MUST NOT contain tables or columns for raw messages or jobs."""
        init_kb(force_create=True, enc_path=self.enc_path)
        conn = get_kb_connection(self.enc_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]

        self.assertNotIn("processed_jobs", tables)
        self.assertNotIn("messages", tables)
        self.assertNotIn("raw_ocr", tables)
        self.assertNotIn("jobs", tables)
        self.assertNotIn("life_and_activities", tables)

        # Inspect table columns: NO evidence or raw_text column
        for tbl in ("preferences", "music_preferences", "viewing_interests", "sports_interests"):
            cursor.execute(f"PRAGMA table_info({tbl})")
            cols = [row[1] for row in cursor.fetchall()]
            self.assertNotIn("evidence", cols)
            self.assertNotIn("raw_message", cols)
            self.assertNotIn("ocr_text", cols)
            self.assertNotIn("job_id", cols)


    # =========================================================================
    # 4. Storage Efficiency & Contradiction Resolution (Requirements 2 & 6)
    # =========================================================================

    def test_save_extracted_batch_and_contradiction_handling(self):
        init_kb(force_create=True, enc_path=self.enc_path)

        # Batch 1: User likes Dark Mode (inference from single observation)
        batch1 = {
            "preferences": [
                {
                    "category": "tech",
                    "item": "Dark Mode",
                    "preference_type": "like",
                    "confidence": "inference",
                    "details": "User selected dark mode in settings",
                    "platform": "VS Code",
                }
            ],
            "music_preferences": [
                {
                    "genre": "Rock",
                    "artist": "Queen",
                    "track": "Bohemian Rhapsody",
                    "platform": "Spotify",
                    "confidence": "inference",
                    "details": "Listening to Queen on Spotify",
                }
            ],
            "viewing_interests": [
                {
                    "media_type": "anime",
                    "title": "Attack on Titan",
                    "platform": "Crunchyroll",
                    "status": "current",
                    "confidence": "inference",
                    "details": "Watching Season 4 Episode 10",
                }
            ],
            "sports_interests": [
                {
                    "sport_name": "cricket",
                    "teams_or_players": "India, CSK",
                    "interest_level": "high",
                    "confidence": "inference",
                    "details": "Checking live cricket score",
                }
            ],
        }

        stats = save_extracted_batch(batch1, enc_path=self.enc_path)
        self.assertEqual(stats["preferences_added"], 1)
        self.assertEqual(stats["music_added"], 1)
        self.assertEqual(stats["viewing_added"], 1)
        self.assertEqual(stats["sports_added"], 1)

        kb = get_full_knowledge_base(enc_path=self.enc_path)
        self.assertEqual(len(kb["preferences"]), 1)
        self.assertEqual(len(kb["likes"]), 1)
        self.assertEqual(len(kb["dislikes"]), 0)
        self.assertEqual(kb["preferences"][0]["item"], "Dark Mode")
        self.assertEqual(kb["preferences"][0]["status"], "active")
        self.assertEqual(kb["preferences"][0]["confidence"], "inference")
        self.assertEqual(kb["preferences"][0]["observation_count"], 1)

        # Batch 2: Repeated observation of Queen elevates inference to explicit_fact on 3rd obs
        save_extracted_batch({"music_preferences": batch1["music_preferences"]}, enc_path=self.enc_path)
        save_extracted_batch({"music_preferences": batch1["music_preferences"]}, enc_path=self.enc_path)

        kb2 = get_full_knowledge_base(enc_path=self.enc_path)
        queen_music = next((m for m in kb2["music_preferences"] if m["artist"] == "Queen"), None)
        self.assertIsNotNone(queen_music)
        self.assertEqual(queen_music["observation_count"], 3)
        self.assertEqual(queen_music["confidence"], "explicit_fact")

        # Batch 3: Contradiction! User switched to Light Mode (dislike dark mode)
        contradiction_batch = {
            "preferences": [
                {
                    "category": "tech",
                    "item": "Dark Mode",
                    "preference_type": "dislike",
                    "confidence": "explicit_fact",
                    "details": "Switched to Light mode to reduce eye strain",
                    "platform": "VS Code",
                }
            ]
        }
        save_extracted_batch(contradiction_batch, enc_path=self.enc_path)

        kb3 = get_full_knowledge_base(enc_path=self.enc_path)
        all_dark_mode = [p for p in kb3["preferences"] if p["item"] == "Dark Mode"]
        self.assertEqual(len(all_dark_mode), 2)
        past_record = next(p for p in all_dark_mode if p["status"] == "past")
        active_record = next(p for p in all_dark_mode if p["status"] == "active")
        self.assertEqual(past_record["preference_type"], "like")
        self.assertEqual(active_record["preference_type"], "dislike")
        self.assertEqual(active_record["confidence"], "explicit_fact")
        self.assertEqual(len(kb3["likes"]), 0)
        self.assertEqual(len(kb3["dislikes"]), 1)
        self.assertEqual(kb3["dislikes"][0]["item"], "Dark Mode")

    # =========================================================================
    # 5. Fast Efficient Lookup via FTS5 Index (Requirements 2 & 6)
    # =========================================================================

    def test_search_knowledge_base_fts5(self):
        """Fast indexed search using FTS5 for ranked and relevant user facts."""
        init_kb(force_create=True, enc_path=self.enc_path)
        save_extracted_batch(
            {
                "preferences": [
                    {"category": "tech", "item": "Python", "preference_type": "like", "details": "Coding in Python"}
                ],
                "sports_interests": [
                    {"sport_name": "cricket", "teams_or_players": "Virat Kohli, India", "interest_level": "high"}
                ],
            },
            enc_path=self.enc_path,
        )

        res_python = search_knowledge_base("Python", enc_path=self.enc_path)
        self.assertTrue(len(res_python) >= 1)
        self.assertEqual(res_python[0]["item"], "Python")

        res_cricket = search_knowledge_base("cricket", enc_path=self.enc_path)
        self.assertTrue(len(res_cricket) >= 1)
        self.assertEqual(res_cricket[0]["sport_name"], "cricket")

    # =========================================================================
    # 6. LLM Extractor Parsing and Prompt Construction (Requirement 3)
    # =========================================================================

    def test_clean_json_text_helper(self):
        markdown_json = "```json\n{\"preferences\": []}\n```"
        self.assertEqual(_clean_json_text(markdown_json), "{\"preferences\": []}")

        raw_json = "   {\"preferences\": [1, 2]}   "
        self.assertEqual(_clean_json_text(raw_json), "{\"preferences\": [1, 2]}")

    @patch("user_knowledge_base.extractor.call_llm")
    def test_extract_user_info_from_batch_success(self, mock_llm):
        mock_llm.return_value = json.dumps(
            {
                "preferences": [
                    {
                        "category": "lifestyle",
                        "item": "Reading Books",
                        "preference_type": "like",
                        "confidence": "inference",
                        "details": "Reading Sci-Fi novel on Kindle app",
                        "platform": "Kindle",
                    }
                ],
                "music_preferences": [],
                "viewing_interests": [],
                "sports_interests": [],
            }
        )

        jobs = [
            {
                "job_id": "job-101",
                "app_name": "Kindle",
                "os": "Windows",
                "timestamp": 1729864200,
                "extracted_text": "Dune Chapter 1: A beginning is the time for taking the most delicate care...",
            }
        ]

        result = extract_user_info_from_batch(jobs)
        self.assertIsNotNone(result)
        self.assertEqual(len(result["preferences"]), 1)
        self.assertEqual(result["preferences"][0]["item"], "Reading Books")
        self.assertEqual(result["preferences"][0]["preference_type"], "like")

    # =========================================================================
    # 7. Background Worker Manager (In-Memory Deduplication, Requirements 1 & 4)
    # =========================================================================

    def test_worker_manager_in_memory_deduplication(self):
        """Worker manager keeps duplicate job check in-memory without database storage."""
        manager = UserKnowledgeBaseWorkerManager()
        self.assertFalse(manager.is_job_recent("job-123"))
        manager.mark_job_recent("job-123")
        self.assertTrue(manager.is_job_recent("job-123"))
        self.assertFalse(manager.is_job_recent("job-456"))

    async def test_worker_manager_lifecycle(self):
        manager = UserKnowledgeBaseWorkerManager()
        self.assertFalse(manager.is_running())

        started = await manager.start()
        self.assertTrue(started)
        self.assertTrue(manager.is_running())

        status = manager.get_status()
        self.assertTrue(status["running"])
        self.assertGreaterEqual(status["num_workers"], 1)

        await manager.stop()
        self.assertFalse(manager.is_running())


if __name__ == "__main__":
    unittest.main()
