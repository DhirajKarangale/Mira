from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import requests

import config
from vault_logger import log

def is_deeper_understanding_needed(
    changes: Dict[str, Any],
    current_regions: List[Dict[str, Any]],
    diff_score: Optional[float] = None,
) -> bool:
    if os.getenv("VLM_ALWAYS_ENRICH", "0").lower() in ("1", "true", "yes"):
        return True

    if not changes.get("has_changes", False):
        return False

    for r in changes.get("added_regions", []):
        rtype = str(r.get("type", "")).lower()
        rtext = str(r.get("text", "")).lower()
        if rtype == "modal" or any(kw in rtext for kw in ("dialog", "alert", "confirm", "warning", "error", "prompt")):
            return True

    for r in changes.get("modified_regions", []):
        rtype = str(r.get("type", "")).lower()
        if rtype == "modal":
            return True

        if float(r.get("similarity", 1.0)) < 0.65:
            return True

    if changes.get("total_changed", 0) >= 2:
        return True

    if diff_score is not None and diff_score >= 0.08:
        return True

    return False

def crop_region_from_image(
    image: np.ndarray,
    bbox: List[int],
    padding: int = 12,
) -> np.ndarray:
    h_img, w_img = image.shape[:2]
    x, y, w, h = bbox

    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(w_img, x + w + padding)
    y2 = min(h_img, y + h + padding)

    if x2 <= x1 or y2 <= y1:

        return image

    return image[y1:y2, x1:x2]

def encode_image_crop_base64(crop: np.ndarray) -> str:
    success, buffer = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not success:
        raise ValueError("Failed to encode image crop to JPEG")
    return base64.b64encode(buffer).decode("utf-8")

def get_vlm_credentials() -> Tuple[Optional[str], Optional[str]]:
    vault_url = config.get_service_url("vault")
    if not vault_url:
        return None, None

    base_url = vault_url.rstrip("/")
    try:

        priorities_resp = requests.get(f"{base_url}/ai/priorities", timeout=3.0)
        providers: List[str] = priorities_resp.json() if priorities_resp.status_code == 200 else ["gemini", "groq"]

        for prov in providers:
            cfg_resp = requests.get(f"{base_url}/ai/configs/{prov}", timeout=3.0)
            if cfg_resp.status_code == 200:
                data = cfg_resp.json()
                keys = data.get("keys", [])
                curr_idx = data.get("current_key", 0)
                if keys and 0 <= curr_idx < len(keys):
                    key = str(keys[curr_idx]).strip()
                    if key:
                        return prov.lower(), key
                elif keys:
                    return prov.lower(), str(keys[0]).strip()
    except Exception as e:
        log(f"Warning: Failed to fetch AI credentials from Vault API: {e}")

    try:
        import sys
        vault_dir = Path(__file__).resolve().parent.parent / "Vault"
        if vault_dir.exists() and str(vault_dir) not in sys.path:
            sys.path.insert(0, str(vault_dir))
            import config_storage
            cfg = config_storage.get_ai_config("gemini")
            if cfg and cfg.get("keys"):
                return "gemini", cfg["keys"][cfg.get("current_key", 0)]
    except Exception:
        pass

    return None, None

def generate_local_heuristic_analysis(
    changed_regions: List[Dict[str, Any]],
    window_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    app_name = window_metadata.get("app_name", "Unknown App")
    os_name = window_metadata.get("os", "Unknown OS")

    types = [r.get("type", "content") for r in changed_regions]
    dominant_type = types[0] if types else "content"

    sample_texts = [r.get("current_text") or r.get("text", "") for r in changed_regions[:3]]
    combined_sample = " | ".join(t.strip() for t in sample_texts if t.strip())

    summary = (
        f"Activity in {app_name} on {os_name}: {len(changed_regions)} UI region(s) updated ({dominant_type}). "
        f"Recent content: {combined_sample[:180]}"
    )

    return {
        "enriched": False,
        "fallback": True,
        "provider": "local_heuristic",
        "component_type": dominant_type,
        "summary": summary,
        "analyzed_regions_count": len(changed_regions),
    }

def analyze_regions_with_vlm(
    image: np.ndarray,
    changed_regions: List[Dict[str, Any]],
    window_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    if not changed_regions:
        return {
            "enriched": False,
            "summary": "No changed regions to analyze.",
            "component_type": "none",
        }

    provider, api_key = get_vlm_credentials()
    if not provider or not api_key:
        return generate_local_heuristic_analysis(changed_regions, window_metadata)

    target_regions = changed_regions[:2]
    app_name = window_metadata.get("app_name", "Application")
    os_name = window_metadata.get("os", "Desktop OS")

    primary_region = target_regions[0]
    bbox = primary_region.get("bbox", [0, 0, image.shape[1], image.shape[0]])
    crop = crop_region_from_image(image, bbox, padding=16)

    try:
        if provider == "gemini":
            import google.generativeai as genai
            from PIL import Image

            genai.configure(api_key=api_key)
            pil_crop = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))

            prompt = (
                f"You are an intelligent desktop assistant analyzing a UI screen crop.\n"
                f"Application: {app_name} on {os_name}\n"
                f"Region Type: {primary_region.get('type')}\n"
                f"Extracted OCR Text: {primary_region.get('current_text') or primary_region.get('text', '')}\n\n"
                f"Provide a 1-sentence contextual description of what the user is doing or what changed in this UI element."
            )

            for model_name in ("gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"):
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content([prompt, pil_crop])
                    summary_text = response.text.strip()
                    if summary_text:
                        return {
                            "enriched": True,
                            "fallback": False,
                            "provider": f"gemini ({model_name})",
                            "component_type": primary_region.get("type", "content"),
                            "summary": summary_text,
                            "analyzed_region_id": primary_region.get("region_id"),
                        }
                except Exception as model_err:
                    log(f"Model {model_name} attempt failed: {model_err}")
                    continue

    except Exception as e:
        log(f"VLM analysis invocation failed ({provider}): {e}")

    return generate_local_heuristic_analysis(changed_regions, window_metadata)
