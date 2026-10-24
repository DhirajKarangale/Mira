from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from knowledge_base.config import (
    DEFAULT_KB_BATCH_SIZE,
    MAX_KB_BATCH_SIZE,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
    COLLECTION_NAME,
    to_unix_timestamp,
)
from knowledge_base.storage import KnowledgeBaseStorage
from knowledge_base.qdrant_store import QdrantVectorStore
from knowledge_base.broker_client import poll_jobs, remove_job, acknowledge_batch
from knowledge_base.worker import KnowledgeBaseWorkerManager
from knowledge_base.encryption import (
    vault_crypto,
    IntegrityVerificationError,
    ENCRYPTION_PREFIX,
)

@pytest.fixture
def temp_kb_dir():
    """Provides an isolated temporary directory for Knowledge Base tests."""
    temp_dir = Path(tempfile.mkdtemp(prefix="mira_test_kb_"))
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

class TestKnowledgeBaseSelectionAndStorage:
    def test_parse_kb_name_valid_and_invalid(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)

        # Valid format kb-DD_MM_YYYY-DD_MM_YYYY
        valid_res = storage.parse_kb_name("kb-01_10_2026-24_10_2026")
        assert valid_res is not None
        assert valid_res["start_date"] == "01_10_2026"
        assert valid_res["end_date"] == "24_10_2026"

        # Invalid formats
        assert storage.parse_kb_name("kb_01_10_2026") is None
        assert storage.parse_kb_name("knowledge_base") is None
        assert storage.parse_kb_name("kb-2026-10-01") is None
        assert storage.parse_kb_name("kb-99_99_9999-99_99_9999") is None

    def test_creation_when_none_exists_for_current_month(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)

        # Base dir is empty
        now = datetime.now()
        current_date_str = now.strftime("%d_%m_%Y")
        expected_name = f"kb-{current_date_str}-{current_date_str}"

        active_path = storage.get_active_knowledge_base()
        assert active_path.exists()
        assert active_path.name == expected_name

        # Verify list_knowledge_bases detects it as current month
        all_kbs = storage.list_knowledge_bases()
        assert len(all_kbs) == 1
        assert all_kbs[0]["name"] == expected_name
        assert all_kbs[0]["is_current_month"] is True

    def test_reuse_existing_knowledge_base_for_current_month(self, temp_kb_dir):
        now = datetime.now()
        current_m = now.strftime("%m")
        current_y = now.strftime("%Y")

        # Create an existing KB folder for current month (e.g. started on 1st of month)
        start_str = f"01_{current_m}_{current_y}"
        end_str = f"10_{current_m}_{current_y}"
        existing_name = f"kb-{start_str}-{end_str}"
        (temp_kb_dir / existing_name).mkdir(parents=True)

        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        active_path = storage.get_active_knowledge_base()

        # Must reuse the existing Knowledge Base
        assert active_path.name == existing_name
        assert storage.get_active_kb_name() == existing_name

    def test_start_date_constant_and_end_date_updated_on_ingestion(self, temp_kb_dir):
        now = datetime.now()
        current_m = now.strftime("%m")
        current_y = now.strftime("%Y")
        today_d = now.strftime("%d")

        # Create KB with earlier end date in current month
        earlier_d = "01" if today_d != "01" else "02"
        start_str = f"01_{current_m}_{current_y}"
        old_end_str = f"{earlier_d}_{current_m}_{current_y}"
        initial_name = f"kb-{start_str}-{old_end_str}"
        initial_dir = temp_kb_dir / initial_name
        initial_dir.mkdir(parents=True)

        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        active_path = storage.get_active_knowledge_base()
        assert active_path.name == initial_name

        # When new data is ingested, update end date to current date
        today_str = now.strftime("%d_%m_%Y")
        expected_updated_name = f"kb-{start_str}-{today_str}"

        updated_path = storage.update_end_date_on_ingestion()
        assert updated_path.name == expected_updated_name
        assert updated_path.exists()
        # Verify start date remained constant
        parsed = storage.parse_kb_name(updated_path.name)
        assert parsed["start_date"] == start_str
        assert parsed["end_date"] == today_str

class TestQdrantIngestionAndSearch:
    def test_ingest_batch_stores_required_fields_and_ignores_job_id(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        job_id = "test-job-uuid-12345"
        dummy_vector = [0.05 * i for i in range(16)]
        jobs = [
            {
                "job_id": job_id,
                "app_name": "Google Chrome",
                "os": "Windows 11",
                "timestamp": 1729760000,
                "summarized_text": "User is reading documentation on FastAPI",
                "embedding": dummy_vector,
            }
        ]

        success = vector_store.ingest_batch(jobs)
        assert success is True
        assert vector_store.count_points() == 1

        # Search to inspect stored payload
        results = vector_store.search(query_vector=dummy_vector, limit=1)
        assert len(results) == 1
        stored = results[0]

        # Verify required fields are stored
        assert stored["app_name"] == "Google Chrome"
        assert stored["os"] == "Windows 11"
        assert stored["timestamp"] == 1729760000
        assert stored["summarized_text"] == "User is reading documentation on FastAPI"

        # Verify job_id is strictly ignored in stored payload
        assert "job_id" not in stored["payload"]
        assert stored["id"] != job_id  # Point ID is an independent UUID

        vector_store.close()

    def test_search_vector_similarity_and_app_filtering(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        v_chrome = [1.0, 0.0, 0.0, 0.0]
        v_edge = [0.0, 1.0, 0.0, 0.0]
        v_code = [0.0, 0.0, 1.0, 0.0]

        jobs = [
            {
                "job_id": "j1",
                "app_name": "Chrome",
                "os": "Windows 11",
                "timestamp": 1729700000,
                "summarized_text": "Browsing GitHub pull requests",
                "embedding": v_chrome,
            },
            {
                "job_id": "j2",
                "app_name": "Edge",
                "os": "Windows 11",
                "timestamp": 1729710000,
                "summarized_text": "Reading Azure documentation",
                "embedding": v_edge,
            },
            {
                "job_id": "j3",
                "app_name": "VS Code",
                "os": "Windows 11",
                "timestamp": 1729720000,
                "summarized_text": "Writing python backend tests",
                "embedding": v_code,
            },
        ]

        vector_store.ingest_batch(jobs)

        # 1. Vector similarity search for Chrome
        results = vector_store.search(query_vector=[0.9, 0.1, 0.0, 0.0], limit=3)
        assert len(results) == 3
        assert results[0]["app_name"] == "Chrome"

        # 2. Filtering by single app_name
        filtered = vector_store.search(query_vector=[0.9, 0.1, 0.0, 0.0], app_name="Edge")
        assert len(filtered) == 1
        assert filtered[0]["app_name"] == "Edge"

        # 3. Filtering by multiple app_names
        multi_filtered = vector_store.search(query_vector=[0.0, 0.5, 0.5, 0.0], app_name=["Edge", "VS Code"])
        assert len(multi_filtered) == 2
        apps = {r["app_name"] for r in multi_filtered}
        assert apps == {"Edge", "VS Code"}

        vector_store.close()

    def test_timestamp_filters_gt_lt_between(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        jobs = [
            {"job_id": "t1", "app_name": "AppA", "timestamp": 1000, "embedding": [0.1, 0.2]},
            {"job_id": "t2", "app_name": "AppB", "timestamp": 2000, "embedding": [0.2, 0.3]},
            {"job_id": "t3", "app_name": "AppC", "timestamp": 3000, "embedding": [0.3, 0.4]},
            {"job_id": "t4", "app_name": "AppD", "timestamp": 4000, "embedding": [0.4, 0.5]},
        ]
        vector_store.ingest_batch(jobs)

        # Greater than condition
        res_gt = vector_store.search(query_vector=[0.2, 0.3], timestamp_gt=2000)
        assert len(res_gt) == 2
        assert all(r["timestamp"] > 2000 for r in res_gt)

        # Less than condition
        res_lt = vector_store.search(query_vector=[0.2, 0.3], timestamp_lt=3000)
        assert len(res_lt) == 2
        assert all(r["timestamp"] < 3000 for r in res_lt)

        # Between condition
        res_between = vector_store.search(query_vector=[0.2, 0.3], timestamp_gte=2000, timestamp_lte=3000)
        assert len(res_between) == 2
        timestamps = {r["timestamp"] for r in res_between}
        assert timestamps == {2000, 3000}

        vector_store.close()

    def test_to_unix_timestamp_exclusive_integers(self):
        # int / float
        assert to_unix_timestamp(1729760000) == 1729760000
        assert to_unix_timestamp(1729760000.75) == 1729760000
        assert to_unix_timestamp("1729760000") == 1729760000

        # ISO format
        iso_ts = to_unix_timestamp("2026-10-24T12:00:00")
        assert isinstance(iso_ts, int)
        assert iso_ts > 0

class TestBrokerAndErrorHandling:
    @patch("knowledge_base.broker_client.requests.get")
    def test_poll_jobs_respects_batch_size(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"job_id": f"job_{i}", "embedding": [0.1, 0.2]} for i in range(5)
        ]
        mock_get.return_value = mock_resp

        jobs = poll_jobs(count=5)
        assert len(jobs) == 5
        mock_get.assert_called_once()
        params = mock_get.call_args[1]["params"]
        assert params["consumer_key"] == CONSUMER_KEY_EMBEDDING_MEMORY
        assert params["count"] == 5

    @patch("knowledge_base.broker_client.requests.delete")
    def test_acknowledge_and_remove_jobs_on_success(self, mock_delete):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_delete.return_value = mock_resp

        acked = acknowledge_batch(["job-1", "job-2"])
        assert acked == 2
        assert mock_delete.call_count == 2

    def test_error_handling_preserves_unprocessed_jobs(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        # Simulate batch with invalid embedding
        invalid_jobs = [
            {"job_id": "bad-job-1", "app_name": "App", "embedding": None},
            {"job_id": "bad-job-2", "app_name": "App", "embedding": "not-a-list"},
        ]

        # Ingestion should return (0, [])
        count, ack_ids = vector_store.ingest_batch(invalid_jobs, return_job_ids=True)
        assert count == 0
        assert len(ack_ids) == 0

        # No jobs are marked for acknowledgment, keeping them in the stream
        vector_store.close()

class TestWorkerManager:
    @pytest.mark.asyncio
    async def test_worker_manager_lifecycle(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)
        manager = KnowledgeBaseWorkerManager(storage=storage, vector_store=vector_store)

        with patch("knowledge_base.worker.get_worker_config") as mock_cfg, \
             patch("knowledge_base.worker.poll_jobs") as mock_poll:
            mock_cfg.return_value = {
                "embedding_vector_store_workers": 2,
                "embedding_vector_store_workers_poll_time": 0.05,
            }
            mock_poll.return_value = []

            await manager.start()
            assert manager.is_running is True
            status = manager.get_status()
            assert status["is_running"] is True
            assert status["worker_count"] == 2

            await manager.stop()
            assert manager.is_running is False
            vector_store.close()


class TestKnowledgeBaseRetention:
    def test_calculate_retention_cutoff_all_options(self):
        from knowledge_base.storage import calculate_retention_cutoff
        now = datetime(2026, 10, 24, 12, 0, 0)

        assert calculate_retention_cutoff("Never auto delete", now) is None
        assert calculate_retention_cutoff("never", now) is None
        assert calculate_retention_cutoff(None, now) is None

        c_5y = calculate_retention_cutoff("5 years", now)
        assert c_5y == datetime(2021, 10, 24, 12, 0, 0)

        c_3y = calculate_retention_cutoff("3 years", now)
        assert c_3y == datetime(2023, 10, 24, 12, 0, 0)

        c_1y = calculate_retention_cutoff("1 year", now)
        assert c_1y == datetime(2025, 10, 24, 12, 0, 0)

        c_9m = calculate_retention_cutoff("9 months", now)
        assert c_9m.year == 2026 and c_9m.month == 1

        c_6m = calculate_retention_cutoff("6 months", now)
        assert c_6m.year == 2026 and c_6m.month == 4

        c_3m = calculate_retention_cutoff("3 months", now)
        assert c_3m.year == 2026 and c_3m.month == 7

    def test_cleanup_expired_knowledge_bases_retention(self, temp_kb_dir):
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)

        # Create dummy KBs:
        # 1. 2 years ago (kb-01_10_2024-15_10_2024) -> Expired under 1 year
        old_kb = temp_kb_dir / "kb-01_10_2024-15_10_2024"
        old_kb.mkdir(parents=True, exist_ok=True)

        # 2. 5 months ago (kb-01_05_2026-15_05_2026) -> Kept under 1 year, expired under 3 months
        med_kb = temp_kb_dir / "kb-01_05_2026-15_05_2026"
        med_kb.mkdir(parents=True, exist_ok=True)

        # 3. Current month KB (active) -> Always preserved
        active_kb = temp_kb_dir / "kb-01_10_2026-24_10_2026"
        active_kb.mkdir(parents=True, exist_ok=True)

        now = datetime(2026, 10, 24, 12, 0, 0)

        # Case A: Never auto delete
        deleted_never = storage.cleanup_expired_knowledge_bases(
            retention_period="Never auto delete",
            now=now
        )
        assert deleted_never == []
        assert old_kb.exists()
        assert med_kb.exists()
        assert active_kb.exists()

        # Case B: 1 year retention (should delete old_kb, keep med_kb and active_kb)
        deleted_1y = storage.cleanup_expired_knowledge_bases(
            retention_period="1 year",
            now=now
        )
        assert "kb-01_10_2024-15_10_2024" in deleted_1y
        assert not old_kb.exists()
        assert med_kb.exists()
        assert active_kb.exists()

        # Case C: 3 months retention (should delete med_kb, keep active_kb)
        deleted_3m = storage.cleanup_expired_knowledge_bases(
            retention_period="3 months",
            now=now
        )
        assert "kb-01_05_2026-15_05_2026" in deleted_3m
        assert not med_kb.exists()
        assert active_kb.exists()


class TestKnowledgeBaseEncryption:
    """Tests for Knowledge Base encryption at rest, decryption on read, MAC verification, and updates."""

    def test_data_encrypted_at_rest_with_prefix(self, temp_kb_dir):
        """Verifies that Knowledge Base summarized_text is encrypted at rest in Qdrant storage."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        secret_text = "Private user screen reading secret medical document"
        dummy_vector = [0.1 * i for i in range(8)]
        jobs = [
            {
                "job_id": "crypto-test-1",
                "app_name": "Medical Records App",
                "os": "Windows 11",
                "timestamp": 1729765000,
                "summarized_text": secret_text,
                "embedding": dummy_vector,
            }
        ]

        success = vector_store.ingest_batch(jobs)
        assert success is True

        # Inspect raw data directly from local Qdrant collection without using vector_store decryption
        client = vector_store.get_client()
        scroll_res, _ = client.scroll(
            collection_name=COLLECTION_NAME,
            with_payload=True,
            with_vectors=False,
            limit=10,
        )
        assert len(scroll_res) == 1
        raw_payload = scroll_res[0].payload

        # Verify plaintext is NEVER present in the raw payload stored on disk
        stored_text = raw_payload.get("summarized_text")
        assert stored_text != secret_text
        assert secret_text not in stored_text

        # Verify stored ciphertext has the encryption prefix and is valid ciphertext
        assert stored_text.startswith(ENCRYPTION_PREFIX)
        assert raw_payload.get("_encrypted") is True

        # Metadata fields remain unencrypted for fast native Qdrant filtering
        assert raw_payload.get("app_name") == "Medical Records App"
        assert raw_payload.get("os") == "Windows 11"
        assert raw_payload.get("timestamp") == 1729765000

        vector_store.close()

    def test_transparent_decryption_on_search(self, temp_kb_dir):
        """Verifies that vector search transparently decrypts summarized_text before returning to caller."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        secret_text = "Confidential financial ledger and payroll information"
        dummy_vector = [0.2 * i for i in range(8)]
        jobs = [
            {
                "job_id": "crypto-test-2",
                "app_name": "Accounting",
                "os": "Windows 11",
                "timestamp": 1729766000,
                "summarized_text": secret_text,
                "embedding": dummy_vector,
            }
        ]

        vector_store.ingest_batch(jobs)

        # Search should transparently return the decrypted plaintext
        results = vector_store.search(query_vector=dummy_vector, limit=1)
        assert len(results) == 1
        assert results[0]["summarized_text"] == secret_text
        assert results[0]["payload"]["summarized_text"] == secret_text
        assert results[0]["app_name"] == "Accounting"

        vector_store.close()

    def test_get_point_and_update_point_payload(self, temp_kb_dir):
        """Verifies get_point and update_point_payload decrypt and re-encrypt data transparently."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        dummy_vector = [0.3 * i for i in range(8)]
        jobs = [
            {
                "job_id": "crypto-test-3",
                "app_name": "Notes App",
                "os": "Windows 11",
                "timestamp": 1729767000,
                "summarized_text": "Original secret note",
                "embedding": dummy_vector,
            }
        ]

        vector_store.ingest_batch(jobs)

        # Get point ID
        results = vector_store.search(query_vector=dummy_vector, limit=1)
        point_id = results[0]["id"]

        # Test get_point
        pt = vector_store.get_point(point_id)
        assert pt is not None
        assert pt["summarized_text"] == "Original secret note"

        # Test update_point_payload with new secret text
        updated = vector_store.update_point_payload(point_id, {"summarized_text": "Updated secret note content"})
        assert updated is True

        # Verify on-disk storage is re-encrypted
        client = vector_store.get_client()
        raw_res = client.retrieve(collection_name=COLLECTION_NAME, ids=[point_id], with_payload=True)
        raw_ct = raw_res[0].payload["summarized_text"]
        assert raw_ct.startswith(ENCRYPTION_PREFIX)
        assert "Updated secret note content" not in raw_ct

        # Verify get_point retrieves updated decrypted text
        pt_after = vector_store.get_point(point_id)
        assert pt_after["summarized_text"] == "Updated secret note content"

        vector_store.close()

    def test_tamper_detection_and_integrity_verification(self, temp_kb_dir):
        """Verifies that altering ciphertext bytes triggers Poly1305 MAC failure and rejects tampered data."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        dummy_vector = [0.4 * i for i in range(8)]
        jobs = [
            {
                "job_id": "crypto-test-4",
                "app_name": "Bank Portal",
                "os": "Windows 11",
                "timestamp": 1729768000,
                "summarized_text": "Account balance: $500,000",
                "embedding": dummy_vector,
            }
        ]

        vector_store.ingest_batch(jobs)
        results = vector_store.search(query_vector=dummy_vector, limit=1)
        point_id = results[0]["id"]

        # Tamper with the raw ciphertext in Qdrant storage
        client = vector_store.get_client()
        raw_res = client.retrieve(collection_name=COLLECTION_NAME, ids=[point_id], with_payload=True)
        orig_ct = raw_res[0].payload["summarized_text"]

        # Flip last characters of ciphertext
        tampered_ct = orig_ct[:-4] + ("AAAA" if not orig_ct.endswith("AAAA") else "BBBB")
        client.set_payload(
            collection_name=COLLECTION_NAME,
            payload={"summarized_text": tampered_ct},
            points=[point_id]
        )

        # 1. get_point must raise IntegrityVerificationError
        with pytest.raises(IntegrityVerificationError):
            vector_store.get_point(point_id)

        # 2. search must discard/exclude the tampered record to protect against unauthorized modification
        search_res = vector_store.search(query_vector=dummy_vector, limit=5)
        assert len(search_res) == 0

        vector_store.close()

    def test_backward_compatibility_with_legacy_plaintext(self, temp_kb_dir):
        """Verifies that pre-existing unencrypted Knowledge Base points are read cleanly without error."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        client = vector_store.get_client()
        dummy_vector = [0.5 * i for i in range(8)]
        vector_store._ensure_collection(client, len(dummy_vector))

        # Directly insert an unencrypted legacy record into Qdrant
        import uuid
        legacy_id = str(uuid.uuid4())
        from qdrant_client import models
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                models.PointStruct(
                    id=legacy_id,
                    vector=dummy_vector,
                    payload={
                        "app_name": "Legacy App",
                        "os": "Windows 10",
                        "timestamp": 1700000000,
                        "summarized_text": "Legacy unencrypted OCR notes from previous version",
                    }
                )
            ]
        )

        # Search should read the legacy unencrypted plaintext cleanly
        results = vector_store.search(query_vector=dummy_vector, limit=1)
        assert len(results) == 1
        assert results[0]["summarized_text"] == "Legacy unencrypted OCR notes from previous version"
        assert results[0]["app_name"] == "Legacy App"

        vector_store.close()

    def test_text_query_filtering_with_encrypted_data(self, temp_kb_dir):
        """Verifies text query filtering operates correctly on decrypted plaintext."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        v1 = [1.0, 0.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0, 0.0]
        jobs = [
            {
                "job_id": "text-test-1",
                "app_name": "Editor",
                "os": "Windows 11",
                "timestamp": 1729769000,
                "summarized_text": "Building high throughput Python FastAPI microservices",
                "embedding": v1,
            },
            {
                "job_id": "text-test-2",
                "app_name": "Browser",
                "os": "Windows 11",
                "timestamp": 1729770000,
                "summarized_text": "Designing responsive React and Tailwind CSS user interfaces",
                "embedding": v2,
            },
        ]

        vector_store.ingest_batch(jobs)

        # Filter for FastAPI
        res_fastapi = vector_store.search(text_query="FastAPI")
        assert len(res_fastapi) == 1
        assert "FastAPI" in res_fastapi[0]["summarized_text"]
        assert res_fastapi[0]["app_name"] == "Editor"

        # Filter for React
        res_react = vector_store.search(text_query="React")
        assert len(res_react) == 1
        assert "React" in res_react[0]["summarized_text"]
        assert res_react[0]["app_name"] == "Browser"

        # Filter for nonexistent term
        res_none = vector_store.search(text_query="KubernetesCluster")
        assert len(res_none) == 0

        vector_store.close()

    def test_deletion_safely_removes_encrypted_data(self, temp_kb_dir):
        """Verifies deletion cleanly removes Knowledge Base directory and all encrypted files."""
        storage = KnowledgeBaseStorage(base_dir=temp_kb_dir)
        vector_store = QdrantVectorStore(storage=storage)

        dummy_vector = [0.6 * i for i in range(8)]
        vector_store.ingest_batch([
            {
                "job_id": "del-1",
                "app_name": "App",
                "os": "Win",
                "timestamp": 1729771000,
                "summarized_text": "Data to be deleted",
                "embedding": dummy_vector,
            }
        ])

        active_kb_name = storage.get_active_kb_name()
        kb_path = temp_kb_dir / active_kb_name
        assert kb_path.exists()

        # Delete knowledge base
        deleted = vector_store.delete_knowledge_base(active_kb_name)
        assert deleted is True
        assert not kb_path.exists()


