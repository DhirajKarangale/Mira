from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from app import app

class TestMemoryApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["service"], "Memory")
        self.assertEqual(data["status"], "online")

    def test_status_endpoint(self):
        response = self.client.get("/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["service"], "Memory")
        self.assertEqual(data["status"], "online")
        self.assertIn("workers", data)
        self.assertIn("image_diff_threshold", data)

    @patch("screenshot_processing.worker_manager.start")
    def test_workers_start(self, mock_start):
        response = self.client.post("/workers/start")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "started")

    @patch("screenshot_processing.worker_manager.stop")
    def test_workers_stop(self, mock_stop):
        response = self.client.post("/workers/stop")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "stopped")

    @patch("app.process_screenshot_job", return_value=True)
    def test_process_job_endpoint(self, mock_process):
        payload = {
            "job_id": "job_test_101",
            "app_name": "TestApp",
            "os": "Windows 11",
            "image_path": "E:/test.png",
        }
        response = self.client.post("/process-job", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "processed")
        self.assertTrue(data["success"])

if __name__ == "__main__":
    unittest.main()
