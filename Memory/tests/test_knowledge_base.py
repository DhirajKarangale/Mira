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
