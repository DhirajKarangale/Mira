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
    build_batch_prompt,
    parse_llm_batch_response,
    summarize_batch,
)
from ocr_summarization.broker_client import (
    poll_jobs,
    publish_summary_job,
    remove_input_job,
)
from ocr_summarization.worker import process_batch_jobs, SummarizationWorkerManager
from ocr_summarization.config import (
    DEFAULT_BATCH_SIZE,
    CONSUMER_KEY_OCR_SUMMARIZATION,
    CONSUMER_KEY_SUMMARY_EMBEDDING,
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
        self.assertIn("Strict Rules for every summary:", prompt)
        self.assertIn("JSON array", prompt)

class TestLLMBatchResponseParsing(unittest.TestCase):
    def test_parse_valid_json_array(self):
        batch_items = [
            {"app_name": "Chrome", "os": "Windows", "extracted_text": "GitHub PR #1"},
            {"app_name": "Slack", "os": "Windows", "extracted_text": "Meeting at 3pm"},
        ]
        raw_llm = json.dumps([
            {"index": 0, "summary": "User is reviewing GitHub PR #1 in Chrome."},
            {"index": 1, "summary": "User is chatting in Slack about a 3pm meeting."}
        ])
        summaries = parse_llm_batch_response(raw_llm, len(batch_items), batch_items)
        self.assertIsNotNone(summaries)
        self.assertEqual(len(summaries), 2)
        self.assertEqual(summaries[0], "User is reviewing GitHub PR #1 in Chrome.")
        self.assertEqual(summaries[1], "User is chatting in Slack about a 3pm meeting.")

    def test_parse_markdown_fenced_json(self):
        batch_items = [
            {"app_name": "Terminal", "os": "Windows", "extracted_text": "git status"},
        ]
        raw_llm = "```json\n[\n  {\"index\": 0, \"summary\": \"User is checking git status in Terminal.\"}\n]\n```"
        summaries = parse_llm_batch_response(raw_llm, 1, batch_items)
        self.assertIsNotNone(summaries)
        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0], "User is checking git status in Terminal.")

    def test_parse_fallback_when_app_identifiable_but_text_empty(self):
        batch_items = [
            {"app_name": "Calculator", "os": "Windows", "extracted_text": ""},
        ]
        raw_llm = "Invalid json response without proper structure"
        summaries = parse_llm_batch_response(raw_llm, 1, batch_items)
        self.assertIsNotNone(summaries)
        self.assertEqual(summaries[0], "User has Calculator open, but the specific activity is unclear.")

    def test_parse_fallback_when_activity_cannot_be_determined(self):
        batch_items = [
            {"app_name": "UnknownApp", "os": "Windows", "extracted_text": "12345 67890 obscure data"},
        ]
        raw_llm = "Invalid json response"
        summaries = parse_llm_batch_response(raw_llm, 1, batch_items)
        self.assertIsNotNone(summaries)
        self.assertEqual(summaries[0], "Activity cannot be determined from the available text.")

    def test_provider_failure_returns_none(self):
        batch_items = [{"app_name": "App", "os": "OS", "extracted_text": "text"}]
        res = parse_llm_batch_response(AI_UNAVAILABLE_MESSAGE, 1, batch_items)
        self.assertIsNone(res)

class TestSummarizeBatchAndMapping(unittest.TestCase):
    @patch("ocr_summarization.summarizer.call_llm")
    def test_one_to_one_mapping_preservation(self, mock_call_llm):
        input_jobs = [
            {"job_id": "job_1", "app_name": "AppA", "os": "Win", "timestamp": 1000.0, "extracted_text": "text A"},
            {"job_id": "job_2", "app_name": "AppB", "os": "Win", "timestamp": 2000.0, "extracted_text": "text B"},
            {"job_id": "job_3", "app_name": "AppC", "os": "Win", "timestamp": 3000.0, "extracted_text": "text C"},
        ]
        mock_call_llm.return_value = json.dumps([
            {"index": 0, "summary": "Summary A"},
            {"index": 1, "summary": "Summary B"},
            {"index": 2, "summary": "Summary C"},
        ])

        output_jobs = summarize_batch(input_jobs)
        self.assertIsNotNone(output_jobs)
        self.assertEqual(len(output_jobs), 3)

        # Check exact one-to-one mapping preservation
        for idx in range(3):
            in_j = input_jobs[idx]
            out_j = output_jobs[idx]
            self.assertNotEqual(out_j["job_id"], in_j["job_id"])  # Brand new UUID
            uuid.UUID(out_j["job_id"])  # Valid UUID format
            self.assertEqual(out_j["app_name"], in_j["app_name"])
            self.assertEqual(out_j["os"], in_j["os"])
            self.assertEqual(out_j["timestamp"], in_j["timestamp"])
            self.assertIn(f"Summary {chr(ord('A') + idx)}", out_j["summarized_text"])

    @patch("ocr_summarization.summarizer.call_llm", return_value=AI_UNAVAILABLE_MESSAGE)
    def test_llm_failure_preserves_jobs(self, mock_call_llm):
        input_jobs = [{"job_id": "job_1", "app_name": "App", "os": "OS", "extracted_text": "text"}]
        result = summarize_batch(input_jobs)
        self.assertIsNone(result)

class TestWorkerProcessingAndPublishing(unittest.TestCase):
    @patch("ocr_summarization.worker.summarize_batch")
    @patch("ocr_summarization.worker.publish_summary_job")
    @patch("ocr_summarization.worker.remove_input_job")
    def test_successful_publish_acknowledges_input_jobs(self, mock_remove, mock_publish, mock_summarize):
        input_jobs = [
            {"job_id": "in_1", "app_name": "App1", "os": "Win", "timestamp": 1.0, "extracted_text": "t1"},
            {"job_id": "in_2", "app_name": "App2", "os": "Win", "timestamp": 2.0, "extracted_text": "t2"},
        ]
        output_jobs = [
            {"job_id": "out_1", "app_name": "App1", "os": "Win", "timestamp": 1.0, "summarized_text": "Sum1"},
            {"job_id": "out_2", "app_name": "App2", "os": "Win", "timestamp": 2.0, "summarized_text": "Sum2"},
        ]
        mock_summarize.return_value = output_jobs
        mock_publish.return_value = True
        mock_remove.return_value = True

        success = process_batch_jobs(input_jobs, worker_id=1)
        self.assertTrue(success)
        self.assertEqual(mock_publish.call_count, 2)
        self.assertEqual(mock_remove.call_count, 2)
        mock_remove.assert_any_call("in_1")
        mock_remove.assert_any_call("in_2")

    @patch("ocr_summarization.worker.summarize_batch")
    @patch("ocr_summarization.worker.publish_summary_job")
    @patch("ocr_summarization.worker.remove_input_job")
    def test_failed_publish_does_not_acknowledge_input_job(self, mock_remove, mock_publish, mock_summarize):
        input_jobs = [
            {"job_id": "in_1", "app_name": "App1", "os": "Win", "timestamp": 1.0, "extracted_text": "t1"},
        ]
        output_jobs = [
            {"job_id": "out_1", "app_name": "App1", "os": "Win", "timestamp": 1.0, "summarized_text": "Sum1"},
        ]
        mock_summarize.return_value = output_jobs
        # Simulate publishing failure
        mock_publish.return_value = False

        success = process_batch_jobs(input_jobs, worker_id=1)
        self.assertFalse(success)
        self.assertEqual(mock_publish.call_count, 1)
        # remove_input_job MUST NOT be called!
        mock_remove.assert_not_called()

    @patch("ocr_summarization.worker.summarize_batch", return_value=None)
    @patch("ocr_summarization.worker.remove_input_job")
    def test_llm_failure_does_not_acknowledge_input_jobs(self, mock_remove, mock_summarize):
        input_jobs = [{"job_id": "in_1", "app_name": "App", "os": "Win", "extracted_text": "text"}]
        success = process_batch_jobs(input_jobs, worker_id=1)
        self.assertFalse(success)
        mock_remove.assert_not_called()

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


