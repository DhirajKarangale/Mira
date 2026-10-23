"""MIRA Memory Service.

Screenshot extraction, OCR text processing, visual change detection,
and context enrichment service.
"""
from __future__ import annotations

from . import screenshot_processing
from .screenshot_processing import (
    worker_manager,
    process_screenshot_job,
    extract_pixels_and_grayscale,
    extract_text_from_image,
    IMAGE_DIFF_THRESHOLD,
    DEFAULT_IMAGE_DIFF_THRESHOLD,
)

__all__ = [
    "screenshot_processing",
    "worker_manager",
    "process_screenshot_job",
    "extract_pixels_and_grayscale",
    "extract_text_from_image",
    "IMAGE_DIFF_THRESHOLD",
    "DEFAULT_IMAGE_DIFF_THRESHOLD",
]
