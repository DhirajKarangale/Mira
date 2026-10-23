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

if __name__ == "__main__":
    unittest.main()
