from __future__ import annotations

import os
from pathlib import Path
import cv2
import numpy as np
import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "Message_Broker"))

from image_comparison import (
    serialize_matrix,
    deserialize_matrix,
    calculate_image_difference,
)
import redis_service as rs


def test_matrix_serialization_and_deserialization():
    arr = np.random.randint(0, 256, (100, 200), dtype=np.uint8)
    serialized = serialize_matrix(arr)

    assert isinstance(serialized, dict)
    assert serialized["shape"] == [100, 200]
    assert serialized["dtype"] == "uint8"
    assert "data" in serialized

    restored = deserialize_matrix(serialized)
    assert isinstance(restored, np.ndarray)
    assert np.array_equal(arr, restored)


def test_matrix_deserialization_from_list():
    raw_list = [[1, 2, 3], [4, 5, 6]]
    arr = deserialize_matrix(raw_list)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (2, 3)
    assert arr[0, 0] == 1


def test_calculate_image_difference_identical():
    img = np.ones((100, 100), dtype=np.uint8) * 128
    diff = calculate_image_difference(img, img.copy())
    assert diff == 0.0


def test_calculate_image_difference_inverted():
    black = np.zeros((100, 100), dtype=np.uint8)
    white = np.ones((100, 100), dtype=np.uint8) * 255
    diff = calculate_image_difference(black, white)
    assert pytest.approx(diff, 0.001) == 1.0


def test_calculate_image_difference_partial():
    base = np.zeros((100, 100), dtype=np.uint8)
    half_changed = base.copy()
    half_changed[:50, :] = 255  # 50% of the image changed from 0 to 255

    diff = calculate_image_difference(base, half_changed)
    assert pytest.approx(diff, 0.01) == 0.5


def test_calculate_image_difference_differing_dimensions():
    img1 = np.zeros((100, 100), dtype=np.uint8)
    img2 = np.zeros((200, 300), dtype=np.uint8)  # Larger dimension, but also all zeros

    diff = calculate_image_difference(img1, img2)
    assert diff == 0.0


@pytest.mark.asyncio
async def test_redis_storage_max_10_retention():
    # Clean previous comparison data
    await rs.remove_image_comparison_data(remove_all=True)

    # Store 15 image records in Redis via redis_service
    dummy_pixels = serialize_matrix(np.zeros((10, 10, 3), dtype=np.uint8))
    dummy_gray = serialize_matrix(np.zeros((10, 10), dtype=np.uint8))

    for i in range(15):
        await rs.store_image_comparison_data({
            "image_id": f"test_img_{i}",
            "app_name": "TestApp" if i % 2 == 0 else "OtherApp",
            "pixel_values": dummy_pixels,
            "grayscale_matrix": dummy_gray,
        })

    # Retrieve recent images
    recent = await rs.get_recent_image_comparison_data(limit=10)
    assert len(recent) == 10

    # Ensure oldest entries (test_img_0 through test_img_4) were evicted
    stored_ids = [r["image_id"] for r in recent]
    assert "test_img_14" in stored_ids
    assert "test_img_13" in stored_ids
    assert "test_img_0" not in stored_ids
    assert "test_img_1" not in stored_ids

    # Search by app_name
    test_app_records = await rs.search_image_comparison_data(app_name="TestApp", limit=10)
    assert all(r["app_name"] == "TestApp" for r in test_app_records)

    # Clean up test data
    await rs.remove_image_comparison_data(remove_all=True)
