from __future__ import annotations

import base64
import json
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import requests

import config
from vault_logger import log


def serialize_matrix(mat: np.ndarray) -> Dict[str, Any]:
    """Serialize a numpy array into a compact JSON-compatible dictionary."""
    if not isinstance(mat, np.ndarray):
        mat = np.array(mat)
    return {
        "shape": list(mat.shape),
        "dtype": str(mat.dtype),
        "data": base64.b64encode(mat.tobytes()).decode("utf-8"),
    }


def deserialize_matrix(data: Any) -> np.ndarray:
    """Deserialize a dictionary, list, or base64 string back into a numpy array."""
    if isinstance(data, np.ndarray):
        return data
    if isinstance(data, dict) and "data" in data and "shape" in data:
        buf = base64.b64decode(data["data"])
        dtype_str = data.get("dtype", "uint8")
        arr = np.frombuffer(buf, dtype=dtype_str)
        return arr.reshape(data["shape"])
    elif isinstance(data, list):
        return np.array(data, dtype=np.uint8)
    elif isinstance(data, str):
        try:
            parsed = json.loads(data)
            return deserialize_matrix(parsed)
        except Exception:
            buf = base64.b64decode(data)
            return np.frombuffer(buf, dtype=np.uint8)
    raise ValueError(f"Cannot deserialize matrix from data of type {type(data)}")


def get_broker_base_url() -> str:
    mb_url = config.get_service_url("message_broker") or config.MESSAGE_BROKER_URL
    if not mb_url:
        raise RuntimeError("Message Broker URL is not configured or discoverable")
    return mb_url.rstrip("/")


def store_image_data(
    app_name: str,
    pixel_values: np.ndarray,
    grayscale_matrix: np.ndarray,
    image_id: Optional[str] = None,
    timestamp: Optional[Union[float, str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Store image pixel values and grayscale matrix for an application in Redis
    strictly through the Message Broker API, retaining the 10 most recent images.
    """
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison"

    payload = {
        "image_id": image_id,
        "app_name": app_name.strip(),
        "timestamp": timestamp or time.time(),
        "pixel_values": serialize_matrix(pixel_values),
        "grayscale_matrix": serialize_matrix(grayscale_matrix),
        "metadata": metadata or {},
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=5.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to store image data in Message Broker: {e}")
        raise RuntimeError(f"Message Broker storage failure: {e}")


def get_recent_images(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve up to 10 most recent image comparison records from Redis via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison"
    params = {"limit": min(max(int(limit), 1), 10)}

    try:
        response = requests.get(endpoint, params=params, timeout=5.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to retrieve recent images from Message Broker: {e}")
        return []


def get_latest_image_for_app(app_name: str) -> Optional[Dict[str, Any]]:
    """Retrieve the single most recent image record belonging to the given application."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison/search"
    params = {"app_name": app_name.strip(), "limit": 1}

    try:
        response = requests.get(endpoint, params=params, timeout=5.0)
        response.raise_for_status()
        records = response.json()
        if records and isinstance(records, list) and len(records) > 0:
            return records[0]
        return None
    except Exception as e:
        log(f"Failed to search previous image for app '{app_name}': {e}")
        return None


def calculate_image_difference(
    previous_gray: Union[np.ndarray, Any],
    current_gray: Union[np.ndarray, Any],
) -> float:
    """
    Compare two grayscale images using cv2.absdiff(previous_gray, current_gray).
    Returns a normalized difference score between 0.0 (identical) and 1.0 (completely inverted).
    """
    prev = deserialize_matrix(previous_gray)
    curr = deserialize_matrix(current_gray)

    if len(prev.shape) == 3:
        prev = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    if len(curr.shape) == 3:
        curr = cv2.cvtColor(curr, cv2.COLOR_BGR2GRAY)

    # Ensure identical shape before cv2.absdiff
    if prev.shape != curr.shape:
        prev = cv2.resize(prev, (curr.shape[1], curr.shape[0]))

    # Calculate differences using cv2.absdiff(previous_gray, current_gray)
    diff = cv2.absdiff(prev, curr)

    # Normalized mean pixel difference across the frame
    diff_score = float(np.mean(diff)) / 255.0
    return diff_score


def compare_app_images(
    app_name: str,
    current_gray: np.ndarray,
) -> Tuple[Optional[float], Optional[Dict[str, Any]]]:
    """
    Compare only images belonging to the same application before calculating image differences.
    Retrieves previous image data from Redis via Message Broker for the same app_name.

    Returns:
        Tuple[Optional[float], Optional[Dict[str, Any]]]:
            (difference_score, previous_image_record) if previous image exists for app,
            or (None, None) if no previous image exists for this app.
    """
    prev_record = get_latest_image_for_app(app_name)
    if not prev_record:
        return None, None

    prev_gray_raw = prev_record.get("grayscale_matrix")
    if prev_gray_raw is None:
        return None, prev_record

    try:
        diff_score = calculate_image_difference(prev_gray_raw, current_gray)
        return diff_score, prev_record
    except Exception as e:
        log(f"Error calculating image difference for app '{app_name}': {e}")
        return None, prev_record


def remove_image_data(
    image_id: Optional[str] = None,
    app_name: Optional[str] = None,
    remove_all: bool = False,
) -> Dict[str, Any]:
    """Remove image comparison data from Redis via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison"
    params: Dict[str, Any] = {}
    if image_id:
        params["image_id"] = image_id
    if app_name:
        params["app_name"] = app_name
    if remove_all:
        params["all"] = True

    try:
        response = requests.delete(endpoint, params=params, timeout=5.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to remove image data via Message Broker: {e}")
        return {"status": "error", "message": str(e)}
