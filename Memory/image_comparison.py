from __future__ import annotations

import base64
import json
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import requests

import config
from vault_logger import log

def serialize_matrix(mat: np.ndarray) -> Dict[str, Any]:
    if not isinstance(mat, np.ndarray):
        mat = np.array(mat)
    return {
        "shape": list(mat.shape),
        "dtype": str(mat.dtype),
        "data": base64.b64encode(mat.tobytes()).decode("utf-8"),
    }

def deserialize_matrix(data: Any) -> np.ndarray:
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
    pixel_values: Optional[np.ndarray],
    grayscale_matrix: np.ndarray,
    image_id: Optional[str] = None,
    timestamp: Optional[Union[float, str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison"

    payload = {
        "image_id": image_id,
        "app_name": app_name.strip(),
        "timestamp": timestamp or time.time(),
        "pixel_values": None,
        "grayscale_matrix": serialize_matrix(grayscale_matrix),
        "metadata": metadata or {},
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=15.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to store image data in Message Broker: {e}")
        raise RuntimeError(f"Message Broker storage failure: {e}")

def get_recent_images(limit: int = 10) -> List[Dict[str, Any]]:
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison"
    params = {"limit": min(max(int(limit), 1), 10)}

    try:
        response = requests.get(endpoint, params=params, timeout=15.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to retrieve recent images from Message Broker: {e}")
        return []

def get_latest_image_for_app(app_name: str) -> Optional[Dict[str, Any]]:
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/images/comparison/search"
    params = {"app_name": app_name.strip(), "limit": 1}

    try:
        response = requests.get(endpoint, params=params, timeout=15.0)
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
    prev = deserialize_matrix(previous_gray)
    curr = deserialize_matrix(current_gray)

    if len(prev.shape) == 3:
        prev = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    if len(curr.shape) == 3:
        curr = cv2.cvtColor(curr, cv2.COLOR_BGR2GRAY)

    # Standardize comparison resolution to 640x360 for speed and noise filtering
    target_size = (640, 360)
    if (prev.shape[1], prev.shape[0]) != target_size:
        prev = cv2.resize(prev, target_size, interpolation=cv2.INTER_AREA)
    if (curr.shape[1], curr.shape[0]) != target_size:
        curr = cv2.resize(curr, target_size, interpolation=cv2.INTER_AREA)

    diff = cv2.absdiff(prev, curr)

    # Suppress font anti-aliasing and subpixel dithering noise (< 12 levels)
    sig_diff = np.where(diff > 12, diff, 0)
    diff_score = float(np.mean(sig_diff)) / 255.0
    return diff_score

def compare_app_images(
    app_name: str,
    current_gray: np.ndarray,
    max_lookback_seconds: float = 300.0,
) -> Tuple[Optional[float], Optional[Dict[str, Any]]]:
    prev_record = get_latest_image_for_app(app_name)
    if not prev_record:
        return None, None

    # Check record age - if older than max_lookback_seconds, treat as a fresh session
    prev_ts = prev_record.get("timestamp")
    if prev_ts is not None:
        try:
            if isinstance(prev_ts, (int, float)):
                age_secs = time.time() - float(prev_ts)
            else:
                dt = datetime.strptime(str(prev_ts), "%d/%m/%YT%H:%M:%S")
                age_secs = (datetime.now() - dt).total_seconds()
            if age_secs > max_lookback_seconds:
                log(
                    f"Previous comparison record for app '{app_name}' is {age_secs:.0f}s old "
                    f"(> {max_lookback_seconds}s). Treating as fresh session."
                )
                return None, None
        except Exception:
            pass

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
        response = requests.delete(endpoint, params=params, timeout=15.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to remove image data via Message Broker: {e}")
        return {"status": "error", "message": str(e)}
