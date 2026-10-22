from __future__ import annotations

import os
from pathlib import Path
import tempfile
import uuid
from unittest.mock import MagicMock, patch
import cv2
import numpy as np
import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from screenshot_worker import (
    IMAGE_DIFF_THRESHOLD,
    process_screenshot_job,
    worker_manager,
    call_operator_delete_screenshot,
)
from image_comparison import serialize_matrix


@pytest.fixture
def sample_image():
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img_path = f.name

    img = np.ones((100, 300, 3), dtype=np.uint8) * 255
    cv2.putText(img, "WORKER TEST", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    cv2.imwrite(img_path, img)

    yield img_path

    if os.path.exists(img_path):
        os.remove(img_path)


def test_threshold_constant_defined():
    assert isinstance(IMAGE_DIFF_THRESHOLD, float)
    assert 0.0 <= IMAGE_DIFF_THRESHOLD <= 1.0


def test_missing_image_file_handling():
    with patch("screenshot_worker.remove_broker_job") as mock_remove:
        mock_remove.return_value = True
        success = process_screenshot_job({
            "job_id": "job_missing",
            "app_name": "TestApp",
            "os": "Windows",
            "image_path": "non_existent_file_path.png",
        })
        assert success is False
        mock_remove.assert_called_once_with("ocr_extraction", "job_missing")


def test_duplicate_frame_skipped(sample_image):
    # Prepare previous image data matching sample_image
    img = cv2.imread(sample_image)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    prev_record = {
        "image_id": "prev_1",
        "app_name": "Calculator",
        "grayscale_matrix": serialize_matrix(gray),
    }

    with patch("screenshot_worker.compare_app_images", return_value=(0.0, prev_record)) as mock_comp, \
         patch("screenshot_worker.call_operator_delete_screenshot") as mock_del, \
         patch("screenshot_worker.remove_broker_job") as mock_rem, \
         patch("screenshot_worker.publish_broker_job") as mock_pub, \
         patch("screenshot_worker.store_image_data") as mock_store:

        mock_del.return_value = True
        mock_rem.return_value = True

        job = {
            "job_id": "dup_job_1",
            "app_name": "Calculator",
            "os": "Windows 11",
            "image_path": sample_image,
        }

        result = process_screenshot_job(job)

        assert result is True
        mock_comp.assert_called_once()
        # Deleted screenshot and removed from ocr_extraction
        mock_del.assert_called_once_with(sample_image)
        mock_rem.assert_called_once_with("ocr_extraction", "dup_job_1")
        # Skipped further processing: did not store, did not publish to ocr_summarization
        mock_store.assert_not_called()
        mock_pub.assert_not_called()


def test_changed_frame_full_workflow(sample_image):
    with patch("screenshot_worker.compare_app_images", return_value=(0.45, None)) as mock_comp, \
         patch("screenshot_worker.store_image_data") as mock_store, \
         patch("screenshot_worker.call_operator_delete_screenshot") as mock_del, \
         patch("screenshot_worker.publish_broker_job") as mock_pub, \
         patch("screenshot_worker.remove_broker_job") as mock_rem:

        mock_store.return_value = {"status": "success"}
        mock_del.return_value = True
        mock_pub.return_value = True
        mock_rem.return_value = True

        job = {
            "job_id": "new_job_123",
            "app_name": "Terminal",
            "os": "Windows 11",
            "image_path": sample_image,
        }

        result = process_screenshot_job(job)

        assert result is True
        mock_comp.assert_called_once()

        # Step 4: Stored current image data
        mock_store.assert_called_once()
        store_call_args = mock_store.call_args[1]
        assert store_call_args["app_name"] == "Terminal"
        assert store_call_args["image_id"] == "new_job_123"

        # Step 6: Deleted screenshot
        mock_del.assert_called_once_with(sample_image)

        # Step 8: Published to ocr_summarization
        mock_pub.assert_called_once()
        published_job = mock_pub.call_args[0][0]
        assert published_job["consumer_key"] == "ocr_summarization"
        assert published_job["app_name"] == "Terminal"
        assert published_job["os"] == "Windows 11"
        assert "WORKER TEST" in published_job["extracted_text"].upper()
        # Validate job_id is a valid UUID
        uuid.UUID(published_job["job_id"])

        # Step 9: Removed from ocr_extraction
        mock_rem.assert_called_once_with("ocr_extraction", "new_job_123")


def test_worker_manager_status():
    status_info = worker_manager.get_status()
    assert "is_running" in status_info
    assert "worker_count" in status_info
    assert "image_diff_threshold" in status_info
    assert status_info["image_diff_threshold"] == IMAGE_DIFF_THRESHOLD


def test_subtle_noise_difference_skipped(sample_image):
    """Verify that minor desktop noise (diff=0.035) is skipped under default 0.05 threshold."""
    with patch("screenshot_worker.compare_app_images", return_value=(0.035, {"image_id": "p1"})) as mock_comp, \
         patch("screenshot_worker.call_operator_delete_screenshot") as mock_del, \
         patch("screenshot_worker.remove_broker_job") as mock_rem, \
         patch("screenshot_worker.publish_broker_job") as mock_pub, \
         patch("screenshot_worker.store_image_data") as mock_store:

        mock_del.return_value = True
        mock_rem.return_value = True

        job = {
            "job_id": "noise_job_1",
            "app_name": "msedge.exe",
            "os": "Windows 11",
            "image_path": sample_image,
        }

        result = process_screenshot_job(job)
        assert result is True
        mock_comp.assert_called_once()
        mock_del.assert_called_once_with(sample_image)
        mock_rem.assert_called_once_with("ocr_extraction", "noise_job_1")
        mock_store.assert_not_called()
        mock_pub.assert_not_called()

