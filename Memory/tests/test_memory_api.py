from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from app import app
from knowledge_base import kb_storage, kb_worker_manager

@pytest.fixture(autouse=True)
def isolated_test_kb_dir():
    temp_dir = Path(tempfile.mkdtemp(prefix="mira_test_api_kb_"))
    kb_storage._custom_base_dir = temp_dir
    kb_storage._active_kb_path = None
    kb_storage._active_kb_name = None
    kb_worker_manager.vector_store.close()

    yield temp_dir

    kb_worker_manager.vector_store.close()
    kb_storage._custom_base_dir = None
    kb_storage._active_kb_path = None
    kb_storage._active_kb_name = None
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_health_endpoint():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "online"

def test_status_endpoint():
    with TestClient(app) as client:
        resp = client.get("/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "knowledge_base" in data
        assert "workers" in data

def test_kb_status_endpoint():
    with TestClient(app) as client:
        resp = client.get("/knowledge-base/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "online"
        assert "workers" in data
        assert "daily_knowledge_bases" in data

def test_batch_ingest_and_search_endpoints():
    with TestClient(app) as client:
        # Ingest batch
        ingest_payload = {
            "jobs": [
                {
                    "app_name": "Calculator",
                    "os": "Windows 11",
                    "timestamp": 1729765000,
                    "summarized_text": "Performing budget calculations",
                    "embedding": [0.1, 0.2, 0.3, 0.4],
                }
            ]
        }
        resp_ingest = client.post("/knowledge-base/batch-ingest", json=ingest_payload)
        assert resp_ingest.status_code == 200
        assert resp_ingest.json()["status"] == "success"
        assert resp_ingest.json()["ingested"] == 1

        # Search
        search_payload = {
            "query_vector": [0.1, 0.2, 0.3, 0.4],
            "limit": 5,
            "app_name": "Calculator",
            "timestamp_gte": 1729760000,
        }
        resp_search = client.post("/knowledge-base/search", json=search_payload)
        assert resp_search.status_code == 200
        search_data = resp_search.json()
        assert search_data["status"] == "success"
        assert search_data["count"] == 1
        assert search_data["results"][0]["app_name"] == "Calculator"

def test_list_knowledge_bases_with_pagination_and_filters():
    with TestClient(app) as client:
        # Create some test KB folders
        base_dir = kb_storage.base_dir
        (base_dir / "kb-01_09_2026-10_09_2026").mkdir(parents=True, exist_ok=True)
        (base_dir / "kb-11_09_2026-20_09_2026").mkdir(parents=True, exist_ok=True)
        (base_dir / "kb-01_10_2026-24_10_2026").mkdir(parents=True, exist_ok=True)

        # 1. List all with pagination
        resp = client.get("/knowledge-base?page=1&limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["total"] == 3
        assert data["page"] == 1
        assert data["limit"] == 2
        assert data["total_pages"] == 2
        assert len(data["knowledge_bases"]) == 2

        # 2. Date filtering
        resp_filtered = client.get("/knowledge-base?start_date=2026-10-01&end_date=2026-10-31")
        assert resp_filtered.status_code == 200
        filtered_data = resp_filtered.json()
        assert filtered_data["total"] == 1
        assert filtered_data["knowledge_bases"][0]["name"] == "kb-01_10_2026-24_10_2026"

def test_delete_knowledge_base_endpoint():
    with TestClient(app) as client:
        base_dir = kb_storage.base_dir
        kb_name = "kb-05_08_2026-15_08_2026"
        (base_dir / kb_name).mkdir(parents=True, exist_ok=True)

        # Test invalid name format
        resp_invalid = client.delete("/knowledge-base/invalid-name-format")
        assert resp_invalid.status_code == 400

        # Test delete existing
        resp_del = client.delete(f"/knowledge-base/{kb_name}")
        assert resp_del.status_code == 200
        assert resp_del.json()["status"] == "success"
        assert not (base_dir / kb_name).exists()

        # Test delete 404
        resp_404 = client.delete(f"/knowledge-base/{kb_name}")
        assert resp_404.status_code == 404

