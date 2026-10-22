from __future__ import annotations

import os
from pathlib import Path
import tempfile
import cv2
import numpy as np
import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_extractor import (
    extract_pixels_and_grayscale,
    extract_text_from_image,
    extract_image_data,
    extract_text,
)


@pytest.fixture
def temp_image():
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        temp_path = f.name

    # Create a test image with high-contrast text "MIRA OCR TEST"
    img = np.ones((120, 400, 3), dtype=np.uint8) * 255  # White background
    cv2.putText(
        img,
        "MIRA OCR TEST",
        (30, 70),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (0, 0, 0),  # Black text
        3,
        cv2.LINE_AA,
    )
    cv2.imwrite(temp_path, img)

    yield temp_path

    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_extract_pixels_and_grayscale(temp_image):
    pixels, grayscale = extract_pixels_and_grayscale(temp_image)

    assert isinstance(pixels, np.ndarray)
    assert isinstance(grayscale, np.ndarray)
    assert pixels.shape == (120, 400, 3)
    assert grayscale.shape == (120, 400)
    assert pixels.dtype == np.uint8
    assert grayscale.dtype == np.uint8

    # Alias check
    pix2, gray2 = extract_image_data(temp_image)
    assert np.array_equal(pixels, pix2)
    assert np.array_equal(grayscale, gray2)


def test_extract_text_from_image(temp_image):
    text = extract_text_from_image(temp_image)
    assert "MIRA" in text.upper()
    assert "OCR" in text.upper()

    # Alias check
    text2 = extract_text(temp_image)
    assert text2 == text


def test_extract_invalid_path():
    with pytest.raises(FileNotFoundError):
        extract_pixels_and_grayscale("non_existent_file_12345.png")

    with pytest.raises(FileNotFoundError):
        extract_text_from_image("non_existent_file_12345.png")
