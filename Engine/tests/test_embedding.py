from __future__ import annotations

import asyncio
from typing import Any, Dict, List
import unittest
from unittest.mock import patch, MagicMock
import uuid

import sys
from pathlib import Path

# Ensure Engine root is on sys.path
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

from embedding.config import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_MODEL_NAME,
    CONSUMER_KEY_SUMMARY_EMBEDDING,
    CONSUMER_GROUP_SUMMARY_EMBEDDING,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
    get_broker_base_url,
    get_embedding_workers_count,
    get_embedding_poll_time,
    get_embedding_model_name,
)
from embedding.embedder import (
    create_output_job,
    process_single_job,
    process_batch_jobs,
)
from embedding.broker_client import (
    poll_jobs,
    publish_embedding_job,
    remove_input_job,
)
from embedding.worker import (
    EmbeddingWorkerManager,
    start_embedding,
    stop_embedding,
    get_embedding_status,
)

class TestEmbeddingConfig(unittest.TestCase):
    def test_consumer_keys_and_groups(self):
        self.assertEqual(CONSUMER_KEY_SUMMARY_EMBEDDING, "summary_embedding")
        self.assertEqual(CONSUMER_GROUP_SUMMARY_EMBEDDING, "CONSUMER_GROUP_SUMMARY_EMBEDDING")
        self.assertEqual(CONSUMER_KEY_EMBEDDING_MEMORY, "embedding_memory")
        self.assertEqual(CONSUMER_GROUP_EMBEDDING_MEMORY, "CONSUMER_GROUP_EMBEDDING_MEMORY")

    def test_workers_count_and_poll_defaults(self):
        workers = get_embedding_workers_count()
        self.assertGreaterEqual(workers, 1)

        poll_time = get_embedding_poll_time()
        self.assertGreaterEqual(poll_time, 0.5)

        model_name = get_embedding_model_name()
        self.assertEqual(model_name, "Qwen/Qwen3-Embedding-0.6B")

class TestEmbedderLogic(unittest.TestCase):
    def test_create_output_job(self):
        input_job = {
            "job_id": "input-1234",
            "app_name": "Microsoft Edge",
            "os": "Windows 11",
            "timestamp": 1730000000,
            "summarized_text": "User is reading documentation in Microsoft Edge.",
        }
        mock_embedding = [0.1, 0.2, -0.3, 0.4]

        out = create_output_job(input_job, mock_embedding)

        # job_id should be newly generated UUID
        self.assertNotEqual(out["job_id"], input_job["job_id"])
        # Should be valid UUID
        uuid_obj = uuid.UUID(out["job_id"])
        self.assertEqual(str(uuid_obj), out["job_id"])

        # Metadata should match original
        self.assertEqual(out["app_name"], "Microsoft Edge")
        self.assertEqual(out["os"], "Windows 11")
        self.assertEqual(out["timestamp"], 1730000000)
        self.assertEqual(out["summarized_text"], "User is reading documentation in Microsoft Edge.")
        self.assertEqual(out["embedding"], mock_embedding)

    @patch("embedding.embedder.publish_embedding_job", return_value=True)
    @patch("embedding.embedder.remove_input_job", return_value=True)
    @patch("embedding.embedder.generate_embedding", return_value=[0.1, 0.2, 0.3])
    def test_process_single_job_success(self, mock_gen, mock_rem, mock_pub):
        job = {
            "job_id": "job-1",
            "app_name": "Test App",
            "os": "Windows",
            "timestamp": 12345,
            "summarized_text": "Sample summary text",
        }
        res = process_single_job(job)
        self.assertTrue(res)
        mock_gen.assert_called_once_with("Sample summary text")
        mock_pub.assert_called_once()
        mock_rem.assert_called_once_with("job-1")

    @patch("embedding.embedder.publish_embedding_job", return_value=False)
    @patch("embedding.embedder.remove_input_job")
    @patch("embedding.embedder.generate_embedding", return_value=[0.1, 0.2, 0.3])
    def test_process_single_job_publish_failure_preserves_job(self, mock_gen, mock_rem, mock_pub):
        job = {
            "job_id": "job-fail-1",
            "app_name": "Test App",
            "os": "Windows",
            "timestamp": 12345,
            "summarized_text": "Sample summary text",
        }
        res = process_single_job(job)
        self.assertFalse(res)
        mock_pub.assert_called_once()
        # Must NOT remove input job if publishing failed
        mock_rem.assert_not_called()

    @patch("embedding.embedder.publish_embedding_job", return_value=True)
    @patch("embedding.embedder.remove_input_job", return_value=True)
    @patch("embedding.embedder.generate_embeddings_batch", return_value=[[0.1, 0.2], [0.3, 0.4]])
    def test_process_batch_jobs_success(self, mock_batch_gen, mock_rem, mock_pub):
        jobs = [
            {"job_id": "job-1", "app_name": "App1", "os": "Win", "timestamp": 1, "summarized_text": "Text 1"},
            {"job_id": "job-2", "app_name": "App2", "os": "Win", "timestamp": 2, "summarized_text": "Text 2"},
        ]
        res = process_batch_jobs(jobs, worker_id=1)
        self.assertTrue(res)
        mock_batch_gen.assert_called_once_with(["Text 1", "Text 2"])
        self.assertEqual(mock_pub.call_count, 2)
        self.assertEqual(mock_rem.call_count, 2)

class TestBrokerClient(unittest.TestCase):
    @patch("requests.get")
    def test_poll_jobs_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"job_id": "1", "app_name": "Edge", "summarized_text": "browsing"},
            {"job_id": "2", "app_name": "Code", "summarized_text": "coding"},
        ]
        mock_get.return_value = mock_resp

        jobs = poll_jobs(count=5)
        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0]["job_id"], "1")
        self.assertEqual(jobs[1]["app_name"], "Code")

    @patch("requests.post")
    def test_publish_embedding_job_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_post.return_value = mock_resp

        output_job = {
            "job_id": "out-1",
            "app_name": "App",
            "os": "Win",
            "timestamp": 12345,
            "summarized_text": "summary",
            "embedding": [0.1, -0.2],
        }

        success = publish_embedding_job(output_job)
        self.assertTrue(success)
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        payload = kwargs.get("json", {})
        self.assertEqual(payload["consumer_key"], "embedding_memory")
        self.assertEqual(payload["embedding"], [0.1, -0.2])

    @patch("requests.delete")
    def test_remove_input_job_success(self, mock_delete):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_delete.return_value = mock_resp

        success = remove_input_job("in-123")
        self.assertTrue(success)
        args, kwargs = mock_delete.call_args
        params = kwargs.get("params", {})
        self.assertEqual(params["consumer_key"], "summary_embedding")
        self.assertEqual(params["job_id"], "in-123")

class TestWorkerLifecycle(unittest.IsolatedAsyncioTestCase):
    async def test_worker_manager_start_and_stop(self):
        manager = EmbeddingWorkerManager()
        self.assertFalse(manager.is_running())

        with patch("embedding.worker.ensure_model_ready", return_value=True), \
             patch("embedding.worker.get_embedding_workers_count", return_value=2), \
             patch("embedding.worker.poll_jobs", return_value=[]):

            started = await manager.start()
            self.assertTrue(started)
            self.assertTrue(manager.is_running())
            self.assertEqual(len(manager._tasks), 2)

            status = manager.get_status()
            self.assertTrue(status["running"])
            self.assertEqual(status["num_workers"], 2)

            await manager.stop()
            self.assertFalse(manager.is_running())
            self.assertEqual(len(manager._tasks), 0)

if __name__ == "__main__":
    unittest.main()
