from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch
import numpy as np

# Ensure Memory is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

import screenshot_processing
from screenshot_processing import (
    worker_manager,
    process_screenshot_job,
    ScreenshotExtractionWorkerManager,
    IMAGE_DIFF_THRESHOLD,
    serialize_matrix,
    deserialize_matrix,
    calculate_image_difference,
    compare_app_images,
    store_image_data,
    get_recent_images,
    calculate_bbox_iou,
    normalize_text,
    compare_ui_regions,
    is_somewhat_similar,
    clean_ocr_text,
    classify_token_irrelevant,
    synthesize_markdown_from_regions,
    format_uia_to_markdown,
    extract_native_uia,
)

class TestScreenshotProcessingSubmodule(unittest.TestCase):
    """Verifies that all screenshot processing components are accessible and function properly."""

    def test_submodule_exports(self):
        self.assertIsNotNone(screenshot_processing.worker_manager)
        self.assertIsNotNone(screenshot_processing.process_screenshot_job)
        self.assertIsNotNone(screenshot_processing.extract_pixels_and_grayscale)
        self.assertIsNotNone(screenshot_processing.extract_text_from_image)
        self.assertIsNotNone(screenshot_processing.compare_app_images)
        self.assertIsNotNone(screenshot_processing.compare_ui_regions)
        self.assertIsNotNone(screenshot_processing.extract_native_uia)

    def test_matrix_serialization_and_deserialization(self):
        mat = np.array([[10, 20, 30], [40, 50, 60]], dtype=np.uint8)
        serialized = serialize_matrix(mat)
        self.assertIn("shape", serialized)
        self.assertIn("data", serialized)
        self.assertEqual(serialized["shape"], [2, 3])

        deserialized = deserialize_matrix(serialized)
        np.testing.assert_array_equal(mat, deserialized)

    def test_image_difference_calculation(self):
        mat1 = np.zeros((360, 640), dtype=np.uint8)
        mat2 = np.zeros((360, 640), dtype=np.uint8)
        diff_identical = calculate_image_difference(mat1, mat2)
        self.assertEqual(diff_identical, 0.0)

        mat3 = np.full((360, 640), 255, dtype=np.uint8)
        diff_extreme = calculate_image_difference(mat1, mat3)
        self.assertGreater(diff_extreme, 0.9)

    def test_bbox_iou(self):
        b1 = [0, 0, 100, 100]
        b2 = [0, 0, 100, 100]
        self.assertEqual(calculate_bbox_iou(b1, b2), 1.0)

        b3 = [200, 200, 50, 50]
        self.assertEqual(calculate_bbox_iou(b1, b3), 0.0)

        b4 = [50, 0, 100, 100]
        iou = calculate_bbox_iou(b1, b4)
        self.assertAlmostEqual(iou, 1.0 / 3.0, places=2)

    def test_normalize_text(self):
        raw = "Logged in at 10:30 AM on 2026-10-23 with 45 users total!"
        norm_with_num = normalize_text(raw, mask_numbers=False)
        self.assertNotIn("10:30", norm_with_num)
        self.assertIn("45", norm_with_num)

        norm_without_num = normalize_text(raw, mask_numbers=True)
        self.assertNotIn("45", norm_without_num)
        self.assertIn("users", norm_without_num)

    def test_compare_ui_regions(self):
        prev = [
            {"region_id": "btn_1", "type": "action", "bbox": [10, 10, 50, 20], "corrected_text": "Save"}
        ]
        curr = [
            {"region_id": "btn_1", "type": "action", "bbox": [10, 10, 50, 20], "corrected_text": "Saved"}
        ]
        diff = compare_ui_regions(prev, curr, previous_text="Save", current_text="Saved")
        self.assertTrue(diff["has_changes"])
        self.assertEqual(len(diff["modified_regions"]), 1)

    def test_is_somewhat_similar(self):
        region_changes = {
            "has_changes": False,
            "total_meaningful_changed": 0,
            "overall_text_similarity": 1.0,
            "added_regions": [],
            "meaningful_modified_regions": [],
        }
        similar, reason = is_somewhat_similar(region_changes, diff_score=0.005)
        self.assertTrue(similar)

        # Significant visual diff should not be marked similar
        not_similar, reason2 = is_somewhat_similar(region_changes, diff_score=0.08)
        self.assertFalse(not_similar)

    def test_clean_ocr_text(self):
        cleaned_client = clean_ocr_text("WiRYA")
        self.assertEqual(cleaned_client, "MIRA CLIENT")

        ocr_garble = "Recs 4p natty ussrcesnoxen"
        cleaned = clean_ocr_text(ocr_garble)
        self.assertIn("Redis", cleaned)
        self.assertIn("Activity", cleaned)
        self.assertIn("MESSAGE_BROKER", cleaned)

    def test_classify_token_irrelevant(self):
        # Taskbar at the bottom
        taskbar_res = classify_token_irrelevant([100, 1050, 50, 20], "Start", 1920, 1080, is_browser=False)
        self.assertEqual(taskbar_res, "taskbar")

        # Browser tab at the top
        browser_res = classify_token_irrelevant([100, 15, 80, 20], "New Tab", 1920, 1080, is_browser=True)
        self.assertEqual(browser_res, "browser_tab")

    def test_synthesize_markdown_from_regions(self):
        ui_regions = [
            {"type": "header", "bbox": [20, 10, 200, 30], "corrected_text": "MIRA Dashboard"},
            {"type": "sidebar", "bbox": [10, 100, 150, 40], "corrected_text": "Settings"},
            {"type": "content", "bbox": [300, 200, 400, 50], "corrected_text": "Welcome to the system"},
        ]
        md = synthesize_markdown_from_regions(ui_regions, app_name="MiraApp", window_title="Main Window")
        self.assertIn("Window: \"Main Window\"", md)
        self.assertIn("MIRA Dashboard", md)
        self.assertIn("Settings", md)
        self.assertIn("Welcome to the system", md)

    def test_format_uia_to_markdown(self):
        elements = [
            {"name": "File", "value": "", "type": "MenuItemControl", "bbox": [0, 0, 50, 20], "has_focus": False},
            {"name": "Save", "value": "", "type": "ButtonControl", "bbox": [100, 10, 60, 25], "has_focus": True},
        ]
        md = format_uia_to_markdown("TestApp", "Editor Window", elements)
        self.assertIn("Window: \"Editor Window\"", md)
        self.assertIn("File", md)
        self.assertIn("Save", md)
        self.assertIn("## Active Focus:", md)

    @patch("screenshot_processing.worker.remove_broker_job", return_value=True)
    def test_process_screenshot_job_invalid(self, mock_remove):
        # Missing required fields
        res = process_screenshot_job({})
        self.assertFalse(res)

    @patch("screenshot_processing.worker.extract_pixels_and_grayscale")
    @patch("screenshot_processing.worker.compare_app_images")
    @patch("screenshot_processing.worker.call_operator_delete_screenshot", return_value=True)
    @patch("screenshot_processing.worker.remove_broker_job", return_value=True)
    @patch("os.path.exists", return_value=True)
    def test_process_screenshot_job_deduplication(
        self, mock_exists, mock_remove, mock_delete, mock_compare, mock_extract
    ):
        mock_extract.return_value = (np.zeros((100, 100, 3), dtype=np.uint8), np.zeros((100, 100), dtype=np.uint8))
        # Returns diff below threshold (0.002 < 0.008) and existing prev_record -> duplicate frame!
        mock_compare.return_value = (0.002, {"timestamp": 12345})

        job = {
            "job_id": "job_dup_1",
            "app_name": "TestApp",
            "os": "Windows",
            "image_path": "fake/path/screenshot.png",
        }
        res = process_screenshot_job(job)
        self.assertTrue(res)
        mock_delete.assert_called_once_with("fake/path/screenshot.png")
        mock_remove.assert_called_once_with("ocr_extraction", "job_dup_1")

if __name__ == "__main__":
    unittest.main()
