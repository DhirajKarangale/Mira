from __future__ import annotations

import os
from pathlib import Path
import shutil
from typing import Tuple, Union

import cv2
import numpy as np
import pytesseract

from vault_logger import log


def _init_tesseract() -> None:
    candidate_paths = [
        os.environ.get("TESSERACT_CMD", ""),
        shutil.which("tesseract"),
        r"C:\Users\dakar\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for candidate in candidate_paths:
        if candidate and os.path.exists(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            tessdata_dir = os.path.join(os.path.dirname(candidate), "tessdata")
            if os.path.exists(tessdata_dir) and "TESSDATA_PREFIX" not in os.environ:
                os.environ["TESSDATA_PREFIX"] = tessdata_dir
            break


_init_tesseract()


def _read_image(image_path: Union[str, Path]) -> np.ndarray:
    path_str = str(image_path)
    if not os.path.exists(path_str):
        raise FileNotFoundError(f"Image not found at path: {path_str}")

    # Use imdecode with fromfile to safely handle Windows paths with unicode/spaces
    try:
        data = np.fromfile(path_str, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        img = cv2.imread(path_str, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError(f"Unable to read or decode image file: {path_str}")

    return img


def extract_text_from_image(image_path: Union[str, Path]) -> str:
    """Extract text from the specified image path using OCR (Tesseract)."""
    img = _read_image(image_path)
    try:
        # Grayscale preprocessing often yields better OCR accuracy
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        text = pytesseract.image_to_string(gray)
        return text.strip()
    except Exception as e:
        log(f"OCR extraction failed for '{image_path}': {e}")
        # Fallback to direct image OCR if grayscale conversion failed
        try:
            return pytesseract.image_to_string(img).strip()
        except Exception as e2:
            log(f"Fallback OCR extraction failed for '{image_path}': {e2}")
            return ""


extract_text = extract_text_from_image


def extract_pixels_and_grayscale(image_path: Union[str, Path]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract pixel values and the grayscale image matrix from the specified image path.
    Returns:
        Tuple[np.ndarray, np.ndarray]: (pixel_values, grayscale_matrix)
    """
    img = _read_image(image_path)
    grayscale = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img, grayscale


extract_image_data = extract_pixels_and_grayscale
