from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import cv2
import numpy as np

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from screenshot_processing import (
    process_screenshot_job,
    worker_manager,
    compare_app_images,
    calculate_image_difference,
    extract_structured_ocr,
    compare_ui_regions,
    IMAGE_DIFF_THRESHOLD,
)

class TestScreenshotPipelineIntegration(unittest.TestCase):
    """End-to-end integration tests for the screenshot processing pipeline."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.img1_path = os.path.join(self.temp_dir.name, "frame1.png")
        self.img2_path = os.path.join(self.temp_dir.name, "frame2.png")

        # Create synthetic frame 1
        img1 = np.full((360, 640, 3), 200, dtype=np.uint8)
        cv2.putText(img1, "Dashboard Active", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
        cv2.imwrite(self.img1_path, img1)

        # Create synthetic frame 2 (identical to frame 1)
        cv2.imwrite(self.img2_path, img1)

    def tearDown(self):
        self.temp_dir.cleanup()

    @patch("screenshot_processing.worker.publish_broker_job", return_value=True)
    @patch("screenshot_processing.worker.remove_broker_job", return_value=True)
    @patch("screenshot_processing.worker.store_image_data")
    @patch("screenshot_processing.worker.compare_app_images", return_value=(None, None))
    @patch("screenshot_processing.worker.call_operator_delete_screenshot", return_value=True)
    def test_novel_frame_pipeline(
        self, mock_delete, mock_compare, mock_store, mock_remove, mock_publish
    ):
        """Tests that a novel frame is fully processed and published to ocr_summarization."""
        job = {
            "job_id": "test_novel_job_001",
            "app_name": "TestApp",
            "os": "Windows 11",
            "image_path": self.img1_path,
            "timestamp": 1700000000,
        }

        # Process job through the submodule
        success = process_screenshot_job(job, worker_id=1)
        self.assertTrue(success)

        # Ensure image was stored in broker
        mock_store.assert_called_once()
        store_call = mock_store.call_args[1]
        self.assertEqual(store_call["app_name"], "TestApp")
        self.assertEqual(store_call["image_id"], "test_novel_job_001")

        # Ensure job was published to ocr_summarization stream
        mock_publish.assert_called_once()
        published_payload = mock_publish.call_args[0][0]
        self.assertEqual(published_payload["consumer_key"], "ocr_summarization")
        self.assertEqual(published_payload["app_name"], "TestApp")

        # Ensure raw screenshot was cleaned up and job removed from ocr_extraction
        mock_delete.assert_called_once_with(self.img1_path)
        mock_remove.assert_called_once_with("ocr_extraction", "test_novel_job_001")

    @patch("screenshot_processing.worker.publish_broker_job")
    @patch("screenshot_processing.worker.remove_broker_job", return_value=True)
    @patch("screenshot_processing.worker.store_image_data")
    @patch("screenshot_processing.worker.compare_app_images")
    @patch("screenshot_processing.worker.call_operator_delete_screenshot", return_value=True)
    def test_duplicate_frame_deduplication(
        self, mock_delete, mock_compare, mock_store, mock_remove, mock_publish
    ):
        """Tests that a duplicate frame (diff < threshold) is deduplicated and not re-published."""
        # Diff below threshold (0.001 < 0.008) with existing previous record
        mock_compare.return_value = (0.001, {"timestamp": 1700000000, "app_name": "TestApp"})

        job = {
            "job_id": "test_dup_job_002",
            "app_name": "TestApp",
            "os": "Windows 11",
            "image_path": self.img2_path,
            "timestamp": 1700000005,
        }

        success = process_screenshot_job(job, worker_id=1)
        self.assertTrue(success)

        # Duplicate should NOT be published to ocr_summarization
        mock_publish.assert_not_called()
        mock_store.assert_not_called()

        # Duplicate frame should be deleted and acknowledged
        mock_delete.assert_called_once_with(self.img2_path)
        mock_remove.assert_called_once_with("ocr_extraction", "test_dup_job_002")

if __name__ == "__main__":
    unittest.main()
