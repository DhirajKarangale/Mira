from __future__ import annotations

import os
from pathlib import Path
import tempfile
from unittest.mock import MagicMock, patch
import cv2
import numpy as np
import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from region_comparator import compare_ui_regions, calculate_bbox_iou
from vlm_service import (
    is_deeper_understanding_needed,
    crop_region_from_image,
    encode_image_crop_base64,
    generate_local_heuristic_analysis,
    analyze_regions_with_vlm,
)
from screenshot_worker import process_screenshot_job


def test_bbox_iou_calculation():
    # Exactly overlapping
    b1 = [10, 10, 100, 50]
    assert calculate_bbox_iou(b1, b1) == 1.0

    # Non-overlapping
    b2 = [200, 200, 50, 50]
    assert calculate_bbox_iou(b1, b2) == 0.0

    # Partial overlap (50% intersection)
    b3 = [10, 10, 100, 100]  # area = 10000
    b4 = [10, 60, 100, 100]  # area = 10000, inter = 100 * 50 = 5000, union = 15000 -> 0.333
    assert pytest.approx(calculate_bbox_iou(b3, b4), 0.01) == 0.333


def test_compare_ui_regions_identifies_all_change_types():
    prev = [
        {"region_id": "header_1", "type": "header", "bbox": [0, 0, 800, 50], "text": "App Title"},
        {"region_id": "content_1", "type": "content", "bbox": [50, 100, 300, 200], "text": "Old Content Text"},
        {"region_id": "sidebar_1", "type": "sidebar", "bbox": [0, 50, 150, 600], "text": "Nav Item"},
    ]
    curr = [
        {"region_id": "header_1", "type": "header", "bbox": [0, 0, 800, 50], "text": "App Title"},  # unchanged
        {"region_id": "content_1", "type": "content", "bbox": [50, 100, 300, 200], "text": "New Content Text"},  # modified
        {"region_id": "modal_1", "type": "modal", "bbox": [200, 200, 400, 300], "text": "Warning Dialog"},  # added
        # sidebar_1 omitted -> removed
    ]

    res = compare_ui_regions(prev, curr, "App Title Old Content Nav Item", "App Title New Content Warning")

    assert res["has_changes"] is True
    assert len(res["unchanged_regions"]) == 1
    assert res["unchanged_regions"][0]["region_id"] == "header_1"

    assert len(res["modified_regions"]) == 1
    assert res["modified_regions"][0]["region_id"] == "content_1"
    assert res["modified_regions"][0]["previous_text"] == "Old Content Text"
    assert res["modified_regions"][0]["current_text"] == "New Content Text"

    assert len(res["added_regions"]) == 1
    assert res["added_regions"][0]["region_id"] == "modal_1"

    assert len(res["removed_regions"]) == 1
    assert res["removed_regions"][0]["region_id"] == "sidebar_1"


def test_vlm_deeper_understanding_triggers():
    # 1. Modal added -> triggers
    changes_with_modal = {
        "has_changes": True,
        "total_changed": 1,
        "added_regions": [{"type": "modal", "text": "Confirm Action"}],
        "modified_regions": [],
    }
    assert is_deeper_understanding_needed(changes_with_modal, []) is True

    # 2. Significant text alteration (< 0.65 similarity) -> triggers
    changes_with_major_text = {
        "has_changes": True,
        "total_changed": 1,
        "added_regions": [],
        "modified_regions": [{"type": "content", "similarity": 0.45}],
    }
    assert is_deeper_understanding_needed(changes_with_major_text, []) is True

    # 3. High visual change (diff >= 0.08) -> triggers
    changes_visual = {
        "has_changes": True,
        "total_changed": 1,
        "added_regions": [],
        "modified_regions": [],
    }
    assert is_deeper_understanding_needed(changes_visual, [], diff_score=0.12) is True

    # 4. No changes -> does not trigger
    no_changes = {"has_changes": False}
    assert is_deeper_understanding_needed(no_changes, [], diff_score=0.01) is False


def test_vlm_crop_and_encoding():
    img = np.zeros((300, 400, 3), dtype=np.uint8)
    img[50:150, 50:150] = 255

    crop = crop_region_from_image(img, [50, 50, 100, 100], padding=10)
    assert crop.shape == (120, 120, 3)

    b64_str = encode_image_crop_base64(crop)
    assert isinstance(b64_str, str)
    assert len(b64_str) > 100


def test_vlm_service_fallback_analysis():
    meta = {"app_name": "Calculator", "os": "Windows 11"}
    changed = [{"type": "content", "current_text": "Result: 42", "bbox": [10, 10, 50, 50]}]

    # When no VLM credentials or offline, local heuristic fallback runs
    with patch("vlm_service.get_vlm_credentials", return_value=(None, None)):
        analysis = analyze_regions_with_vlm(np.zeros((100, 100, 3), dtype=np.uint8), changed, meta)
        assert analysis["enriched"] is False
        assert analysis["fallback"] is True
        assert "Calculator" in analysis["summary"]


@pytest.fixture
def sample_test_image():
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img_path = f.name

    img = np.ones((200, 600, 3), dtype=np.uint8) * 255
    cv2.putText(img, "APP HEADER", (30, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img, "Main Panel Details", (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    cv2.imwrite(img_path, img)

    yield img_path

    if os.path.exists(img_path):
        os.remove(img_path)


def test_full_contextual_pipeline_publishes_structured_context(sample_test_image):
    with patch("screenshot_worker.compare_app_images", return_value=(0.15, None)), \
         patch("screenshot_worker.store_image_data") as mock_store, \
         patch("screenshot_worker.call_operator_delete_screenshot") as mock_del, \
         patch("screenshot_worker.publish_broker_job") as mock_pub, \
         patch("screenshot_worker.remove_broker_job") as mock_rem:

        mock_store.return_value = {"status": "success"}
        mock_del.return_value = True
        mock_pub.return_value = True
        mock_rem.return_value = True

        job = {
            "job_id": "test_ctx_job_001",
            "app_name": "MIRA UI",
            "os": "Windows 11",
            "image_path": sample_test_image,
            "timestamp": "22/10/2026T18:30:00",
        }

        success = process_screenshot_job(job)
        assert success is True

        # Verify stored image comparison data contains structured metadata
        mock_store.assert_called_once()
        stored_kwargs = mock_store.call_args[1]
        assert stored_kwargs["app_name"] == "MIRA UI"
        assert stored_kwargs["image_id"] == "test_ctx_job_001"
        assert "metadata" in stored_kwargs
        stored_meta = stored_kwargs["metadata"]
        assert "window_metadata" in stored_meta
        assert "ui_regions" in stored_meta
        assert "changes" in stored_meta
        assert "vlm_analysis" in stored_meta

        # Verify published job to ocr_summarization has all required structured context
        mock_pub.assert_called_once()
        published_payload = mock_pub.call_args[0][0]
        assert published_payload["consumer_key"] == "ocr_summarization"
        assert published_payload["app_name"] == "MIRA UI"
        assert published_payload["os"] == "Windows 11"
        assert "extracted_text" in published_payload
        assert len(published_payload["extracted_text"]) > 0

        # Structured context assertions
        assert "window_metadata" in published_payload
        assert published_payload["window_metadata"]["dimensions"]["width"] == 600
        assert published_payload["window_metadata"]["dimensions"]["height"] == 200

        assert "ui_regions" in published_payload
        assert len(published_payload["ui_regions"]) > 0
        assert all("bbox" in r and "text" in r and "type" in r for r in published_payload["ui_regions"])

        assert "changes" in published_payload
        assert "vlm_analysis" in published_payload

        # Operator screenshot deletion and extraction acknowledgment
        mock_del.assert_called_once_with(sample_test_image)
        mock_rem.assert_called_once_with("ocr_extraction", "test_ctx_job_001")
