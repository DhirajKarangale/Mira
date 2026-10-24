from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from app import app
from knowledge_base import (
    DEFAULT_BATCH_SIZE,
    KnowledgeBaseStorage,
    QdrantVectorStore,
    VaultCryptoClient,
    encrypt_text,
    decrypt_text,
    poll_embedding_jobs,
    remove_embedding_job,
    process_kb_batch,
    KnowledgeBaseWorkerManager,
)
import config

class TestKnowledgeBaseSubmodule(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.system_path = Path(self.temp_dir)
        self.kb_storage = KnowledgeBaseStorage(system_path_override=self.system_path)
        self.client = TestClient(app)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_monthly_kb_directory_organization(self):
        """Tests that knowledge bases are organized by month and reused if in current month."""
        test_dt1 = datetime(2026, 10, 15, 10, 30, 0)
        kb_name1, kb_dir1 = self.kb_storage.get_active_knowledge_base(current_dt=test_dt1)

        self.assertEqual(kb_name1, "kb_15_10_2026")
        self.assertTrue(kb_dir1.exists())
        self.assertTrue(kb_dir1.is_dir())

        # Test reuse during the same month (e.g., on 24th October 2026)
        test_dt2 = datetime(2026, 10, 24, 12, 0, 0)
        kb_name2, kb_dir2 = self.kb_storage.get_active_knowledge_base(current_dt=test_dt2)
        self.assertEqual(kb_name2, "kb_15_10_2026")
        self.assertEqual(kb_dir1, kb_dir2)

        # Test new creation in next month (e.g., on 5th November 2026)
        test_dt3 = datetime(2026, 11, 5, 8, 0, 0)
        kb_name3, kb_dir3 = self.kb_storage.get_active_knowledge_base(current_dt=test_dt3)
        self.assertEqual(kb_name3, "kb_05_11_2026")
        self.assertNotEqual(kb_dir1, kb_dir3)

        # Test list_knowledge_bases
        kbs = self.kb_storage.list_knowledge_bases()
        self.assertEqual(len(kbs), 2)
        names = [k["name"] for k in kbs]
        self.assertIn("kb_15_10_2026", names)
        self.assertIn("kb_05_11_2026", names)

    def test_vault_encryption_decryption(self):
        """Tests Vault-based encryption and decryption of payload data."""
        plaintext = "Confidential user screen text: Bank balance is $5,000"
        encrypted = encrypt_text(plaintext)
        self.assertNotEqual(plaintext, encrypted)
        self.assertIsInstance(encrypted, str)

        decrypted = decrypt_text(encrypted)
        self.assertEqual(plaintext, decrypted)

        # Batch encryption
        batch_plain = ["item one", "item two", "item three"]
        crypto_client = VaultCryptoClient()
        batch_enc = crypto_client.encrypt_batch(batch_plain)
        self.assertEqual(len(batch_enc), 3)
        batch_dec = crypto_client.decrypt_batch(batch_enc)
        self.assertEqual(batch_plain, batch_dec)

    def test_qdrant_store_batch_ingest_and_search(self):
        """Tests Qdrant collection creation, payload indexing, batch ingestion and search."""
        kb_dir = self.system_path / "knowledge_base" / "kb_24_10_2026"
        store = QdrantVectorStore(kb_path=kb_dir, collection_name="test_kb")

        sample_vector_1 = [0.1] * 128
        sample_vector_2 = [-0.1] * 128

        jobs = [
            {
                "job_id": "job_to_ignore_1",
                "app_name": "Google Chrome",
                "os": "Windows 11",
                "timestamp": 1729760000,
                "summarized_text": "User browsing Python documentation on browser",
                "embedding": sample_vector_1,
            },
            {
                "job_id": "job_to_ignore_2",
                "app_name": "Visual Studio Code",
                "os": "Windows 11",
                "timestamp": 1729760100,
                "summarized_text": "User coding async workers in VS Code",
                "embedding": sample_vector_2,
            },
        ]

        # Batch ingestion
        success = store.ingest_batch(jobs)
        self.assertTrue(success)
        self.assertEqual(store.get_count(), 2)

        # Search with app_name filter
        results = store.search(query_vector=sample_vector_1, limit=5, app_name="Google Chrome")
        self.assertTrue(len(results) >= 1)
        first_hit = results[0]
        self.assertEqual(first_hit["payload"]["app_name"], "Google Chrome")
        self.assertEqual(first_hit["payload"]["os"], "Windows 11")
        # Ensure summarized_text was decrypted on retrieval
        self.assertEqual(first_hit["payload"]["summarized_text"], "User browsing Python documentation on browser")
        # Ensure job_id was NOT stored in the payload
        self.assertNotIn("job_id", first_hit["payload"])

        store.close()

    @patch("knowledge_base.worker.remove_embedding_job")
    def test_process_kb_batch_success_acknowledges_jobs(self, mock_remove):
        """Tests that jobs are acknowledged and removed only after successful storage."""
        mock_remove.return_value = True

        kb_dir = self.system_path / "knowledge_base" / "kb_test_batch"
        store = QdrantVectorStore(kb_path=kb_dir, collection_name="test_ack")

        jobs = [
            {
                "job_id": "job_ack_1",
                "app_name": "Slack",
                "os": "Windows 11",
                "timestamp": 1729760200,
                "summarized_text": "Team conversation",
                "embedding": [0.05] * 64,
            },
            {
                "job_id": "job_ack_2",
                "app_name": "Slack",
                "os": "Windows 11",
                "timestamp": 1729760300,
                "summarized_text": "Discussion on deployment",
                "embedding": [0.06] * 64,
            },
        ]

        success = process_kb_batch(jobs, worker_id=1, vector_store=store)
        self.assertTrue(success)
        # Verify remove_embedding_job was called for each job_id
        self.assertEqual(mock_remove.call_count, 2)
        mock_remove.assert_any_call("job_ack_1")
        mock_remove.assert_any_call("job_ack_2")

        store.close()

    @patch("knowledge_base.worker.remove_embedding_job")
    def test_process_kb_batch_failure_retains_jobs(self, mock_remove):
        """Tests that jobs are NOT removed from broker if Qdrant ingestion fails."""
        mock_store = MagicMock()
        mock_store.ingest_batch.side_effect = RuntimeError("Disk full / vector error")

        jobs = [
            {
                "job_id": "job_failed_1",
                "app_name": "Terminal",
                "os": "Windows 11",
                "timestamp": 1729760400,
                "summarized_text": "Terminal command output",
                "embedding": [0.01] * 64,
            }
        ]

        success = process_kb_batch(jobs, worker_id=1, vector_store=mock_store)
        self.assertFalse(success)
        # Job must NOT be removed from Message Broker on failure
        mock_remove.assert_not_called()

    def test_api_status_includes_knowledge_base(self):
        """Tests that GET /status includes knowledge_base worker and storage status."""
        response = self.client.get("/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("workers", data)
        self.assertIn("knowledge_base", data)
        kb_info = data["knowledge_base"]
        self.assertIn("is_running", kb_info)
        self.assertIn("worker_count", kb_info)
        self.assertIn("poll_time", kb_info)
        self.assertIn("batch_size", kb_info)
        self.assertIn("active_knowledge_base", kb_info)

    def test_knowledge_base_endpoints(self):
        """Tests dedicated knowledge base endpoints in Memory service."""
        # GET /knowledge-base/status
        res_status = self.client.get("/knowledge-base/status")
        self.assertEqual(res_status.status_code, 200)
        status_data = res_status.json()
        self.assertEqual(status_data["status"], "online")
        self.assertIn("workers", status_data)

        # POST /knowledge-base/batch-ingest
        sample_vector = [0.02] * 32
        ingest_payload = {
            "jobs": [
                {
                    "app_name": "Notepad",
                    "os": "Windows 11",
                    "timestamp": 1729760500,
                    "summarized_text": "Meeting notes on project timeline",
                    "embedding": sample_vector,
                }
            ]
        }
        res_ingest = self.client.post("/knowledge-base/batch-ingest", json=ingest_payload)
        self.assertEqual(res_ingest.status_code, 200)
        self.assertEqual(res_ingest.json()["ingested"], 1)

        # POST /knowledge-base/search
        search_payload = {
            "query_vector": sample_vector,
            "limit": 3,
            "app_name": "Notepad",
        }
        res_search = self.client.post("/knowledge-base/search", json=search_payload)
        self.assertEqual(res_search.status_code, 200)
        search_data = res_search.json()
        self.assertTrue(search_data["count"] >= 1)
        self.assertEqual(search_data["results"][0]["payload"]["summarized_text"], "Meeting notes on project timeline")

if __name__ == "__main__":
    unittest.main()
