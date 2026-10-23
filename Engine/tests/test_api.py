from __future__ import annotations

import unittest
from unittest.mock import patch
from pathlib import Path
import sys

engine_dir = Path(__file__).resolve().parent.parent
if str(engine_dir) not in sys.path:
    sys.path.insert(0, str(engine_dir))

from fastapi.testclient import TestClient
from app import app

class TestEngineAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("service"), "Engine")
        self.assertEqual(data.get("status"), "online")

    def test_status_endpoint(self):
        response = self.client.get("/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("service"), "Engine")
        self.assertIn("ai_priorities", data)
        self.assertIn("active_provider", data)

    @patch("app.call_llm", return_value="Test summary answer")
    def test_llm_call_endpoint(self, mock_call):
        payload = {
            "prompt": "Summarize this screenshot OCR text",
            "work": "summarization"
        }
        response = self.client.post("/llm/call", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("response"), "Test summary answer")
        self.assertEqual(data.get("work"), "summarization")

    def test_summarization_endpoints(self):
        # Test status
        status_resp = self.client.get("/summarization/status")
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.json()
        self.assertIn("running", status_data)
        self.assertIn("batch_size", status_data)

        # Test start
        start_resp = self.client.post("/summarization/start")
        self.assertEqual(start_resp.status_code, 200)
        start_data = start_resp.json()
        self.assertIn("status", start_data)

        # Test stop
        stop_resp = self.client.post("/summarization/stop")
        self.assertEqual(stop_resp.status_code, 200)
        stop_data = stop_resp.json()
        self.assertEqual(stop_data.get("status"), "stopped")

if __name__ == "__main__":
    unittest.main()
