from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch
import json
from pathlib import Path
import sys
import uuid

# Add Engine directory to sys.path
engine_dir = Path(__file__).resolve().parent.parent
if str(engine_dir) not in sys.path:
    sys.path.insert(0, str(engine_dir))

from ocr_summarization.summarizer import (
    sanitize_job_input,
    build_single_prompt,
    build_batch_prompt,
    parse_llm_single_response,
    parse_llm_batch_response,
    summarize_job,
    summarize_batch,
)
from ocr_summarization.broker_client import (
    poll_jobs,
    publish_embedding_memory_job,
    publish_summary_job,
    remove_input_job,
)
from ocr_summarization.worker import (
    process_single_job,
    process_batch_jobs,
    SummarizationWorkerManager,
)
from ocr_summarization.config import (
    DEFAULT_BATCH_SIZE,
    CONSUMER_KEY_OCR_SUMMARIZATION,
    CONSUMER_KEY_EMBEDDING_MEMORY,
)
from llm.caller import AI_UNAVAILABLE_MESSAGE

class TestBatchPreparationAndPrompt(unittest.TestCase):
    def test_sanitize_job_input(self):
        raw_job = {
            "job_id": "test_id_123",
            "consumer_key": "ocr_summarization",
            "app_name": "Visual Studio Code",
            "os": "Windows 11",
            "timestamp": 1729600000.0,
            "extracted_text": "def test_login(): pass",
            "extra_metadata": {"foo": "bar"},
            "ui_regions": [1, 2, 3],
        }
        sanitized = sanitize_job_input(raw_job)
        self.assertEqual(
            sanitized,
            {
                "app_name": "Visual Studio Code",
                "os": "Windows 11",
                "extracted_text": "def test_login(): pass",
            }
        )
        self.assertNotIn("job_id", sanitized)
        self.assertNotIn("ui_regions", sanitized)

    def test_build_single_prompt(self):
        item = {"app_name": "msedge.exe", "os": "Windows 11", "extracted_text": "Docs and search"}
        prompt = build_single_prompt(item)
        self.assertIn("msedge.exe", prompt)
        self.assertIn("Windows 11", prompt)
        self.assertIn("Docs and search", prompt)
        self.assertIn("Output Format:", prompt)

    def test_build_batch_prompt(self):
        batch = [
            {"app_name": "Chrome", "os": "Windows", "extracted_text": "GitHub PR #1"},
            {"app_name": "Slack", "os": "Windows", "extracted_text": "Meeting at 3pm"},
        ]
        prompt = build_batch_prompt(batch)
        self.assertIn("Chrome", prompt)
        self.assertIn("Slack", prompt)
        self.assertIn("GitHub PR #1", prompt)
        self.assertIn("Meeting at 3pm", prompt)
        self.assertIn("Strict Rules for the summary:", prompt)
        self.assertIn("JSON array", prompt)

class TestLLMResponseParsing(unittest.TestCase):
    def test_parse_single_valid_json(self):
        raw_llm = json.dumps({
            "app_name": "Microsoft Edge",
            "summary": "User is browsing technical documentation in Microsoft Edge."
        })
        item = {"app_name": "msedge.exe", "os": "Win", "extracted_text": "Documentation"}
        parsed = parse_llm_single_response(raw_llm, item)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["app_name"], "Microsoft Edge")
        self.assertEqual(parsed["summary"], "User is browsing technical documentation in Microsoft Edge.")

    def test_parse_single_fallback_on_unclear(self):
        raw_llm = "Non-json text"
        item = {"app_name": "notepad.exe", "os": "Win", "extracted_text": ""}
        parsed = parse_llm_single_response(raw_llm, item)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["app_name"], "notepad")
        self.assertIn("unclear", parsed["summary"])

    def test_parse_valid_json_array(self):
        batch_items = [
            {"app_name": "chrome.exe", "os": "Windows", "extracted_text": "GitHub PR #1"},
            {"app_name": "slack.exe", "os": "Windows", "extracted_text": "Meeting at 3pm"},
        ]
        raw_llm = json.dumps([
            {"index": 0, "app_name": "Google Chrome", "summary": "User is reviewing GitHub PR #1 in Google Chrome."},
            {"index": 1, "app_name": "Slack", "summary": "User is chatting about a 3pm meeting in Slack."}
        ])
        results = parse_llm_batch_response(raw_llm, len(batch_items), batch_items)
        self.assertIsNotNone(results)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["app_name"], "Google Chrome")
        self.assertEqual(results[0]["summary"], "User is reviewing GitHub PR #1 in Google Chrome.")
        self.assertEqual(results[1]["app_name"], "Slack")
        self.assertEqual(results[1]["summary"], "User is chatting about a 3pm meeting in Slack.")

    def test_provider_failure_returns_none(self):
        item = {"app_name": "App", "os": "OS", "extracted_text": "text"}
        res = parse_llm_single_response(AI_UNAVAILABLE_MESSAGE, item)
        self.assertIsNone(res)

class TestWorkerProcessingAndPublishing(unittest.TestCase):
    @patch("ocr_summarization.worker.summarize_job")
    @patch("ocr_summarization.worker.get_embedding")
    @patch("ocr_summarization.worker.publish_embedding_memory_job")
    @patch("ocr_summarization.worker.remove_input_job")
    def test_process_single_job_success(self, mock_remove, mock_publish, mock_embed, mock_summarize):
        input_job = {
            "job_id": "in_1",
            "app_name": "msedge.exe",
            "os": "Windows 11",
            "timestamp": 1729600000,
            "extracted_text": "Python documentation",
        }
        mock_summarize.return_value = {
            "app_name": "Microsoft Edge",
            "summary": "User is reading Python docs in Microsoft Edge.",
        }
        mock_embed.return_value = [0.1, -0.2, 0.3]
        mock_publish.return_value = True
        mock_remove.return_value = True

        success = process_single_job(input_job, worker_id=1)
        self.assertTrue(success)

        # Verify summarizer called with input job
        mock_summarize.assert_called_once_with(input_job)

        # Verify embedding called with ONLY summarized_text
        mock_embed.assert_called_once_with("User is reading Python docs in Microsoft Edge.")

        # Verify output object structure
        mock_publish.assert_called_once()
        published_job = mock_publish.call_args[0][0]
        self.assertNotEqual(published_job["job_id"], "in_1")
        uuid.UUID(published_job["job_id"])  # Valid UUID
        self.assertEqual(published_job["app_name"], "Microsoft Edge")
        self.assertEqual(published_job["os"], "Windows 11")
        self.assertEqual(published_job["timestamp"], 1729600000)
        self.assertEqual(published_job["summarized_text"], "User is reading Python docs in Microsoft Edge.")
        self.assertEqual(published_job["embedding"], [0.1, -0.2, 0.3])

        # Verify input job was acknowledged and removed
        mock_remove.assert_called_once_with("in_1")

    @patch("ocr_summarization.worker.summarize_job")
    @patch("ocr_summarization.worker.get_embedding")
    @patch("ocr_summarization.worker.publish_embedding_memory_job")
    @patch("ocr_summarization.worker.remove_input_job")
    def test_failed_publish_preserves_input_job(self, mock_remove, mock_publish, mock_embed, mock_summarize):
        input_job = {
            "job_id": "in_1",
            "app_name": "msedge.exe",
            "os": "Windows 11",
            "extracted_text": "test",
        }
        mock_summarize.return_value = {
            "app_name": "Microsoft Edge",
            "summary": "Browsing in Microsoft Edge.",
        }
        mock_embed.return_value = [0.1]
        mock_publish.return_value = False

        success = process_single_job(input_job, worker_id=1)
        self.assertFalse(success)
        mock_remove.assert_not_called()

    @patch("ocr_summarization.worker.summarize_job", return_value=None)
    @patch("ocr_summarization.worker.remove_input_job")
    def test_summarization_failure_preserves_input_job(self, mock_remove, mock_summarize):
        input_job = {"job_id": "in_1", "app_name": "App", "os": "Win", "extracted_text": "text"}
        success = process_single_job(input_job, worker_id=1)
        self.assertFalse(success)
        mock_remove.assert_not_called()

    @patch("ocr_summarization.worker.summarize_job")
    @patch("ocr_summarization.worker.get_embedding", side_effect=RuntimeError("Embedding error"))
    @patch("ocr_summarization.worker.remove_input_job")
    def test_embedding_failure_preserves_input_job(self, mock_remove, mock_embed, mock_summarize):
        input_job = {"job_id": "in_1", "app_name": "App", "os": "Win", "extracted_text": "text"}
        mock_summarize.return_value = {"app_name": "App", "summary": "Activity in App."}
        success = process_single_job(input_job, worker_id=1)
        self.assertFalse(success)
        mock_remove.assert_not_called()

    @patch("ocr_summarization.worker.process_single_job")
    def test_process_batch_jobs_calls_process_single_job_individually(self, mock_process_single):
        jobs = [
            {"job_id": "in_1", "app_name": "App1", "os": "Win", "extracted_text": "t1"},
            {"job_id": "in_2", "app_name": "App2", "os": "Win", "extracted_text": "t2"},
        ]
        mock_process_single.return_value = True

        success = process_batch_jobs(jobs, worker_id=1)
        self.assertTrue(success)
        self.assertEqual(mock_process_single.call_count, 2)
        mock_process_single.assert_any_call(jobs[0], worker_id=1)
        mock_process_single.assert_any_call(jobs[1], worker_id=1)

class TestWorkerManager(unittest.IsolatedAsyncioTestCase):
    async def test_start_and_stop_workers(self):
        manager = SummarizationWorkerManager()
        self.assertFalse(manager.is_running())

        with patch("ocr_summarization.worker.get_summarization_workers_count", return_value=2):
            with patch("ocr_summarization.worker.poll_jobs", return_value=[]):
                started = await manager.start()
                self.assertTrue(started)
                self.assertTrue(manager.is_running())
                status = manager.get_status()
                self.assertEqual(status["num_workers"], 2)
                self.assertEqual(status["batch_size"], DEFAULT_BATCH_SIZE)

                await manager.stop()
                self.assertFalse(manager.is_running())

if __name__ == "__main__":
    unittest.main()
