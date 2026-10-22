from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from vault_logger import log

def is_deeper_understanding_needed(
    changes: Dict[str, Any],
    current_regions: List[Dict[str, Any]],
    diff_score: Optional[float] = None,
) -> bool:
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

    if diff_score is not None and diff_score >= 0.03:
        return True

    return False

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
        "fallback": False,
        "provider": "local_heuristic",
        "component_type": dominant_type,
        "summary": summary,
        "analyzed_regions_count": len(changed_regions),
    }

def analyze_regions_with_vlm(
    image: Any,
    changed_regions: List[Dict[str, Any]],
    window_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Purely local heuristic UI analysis without any external LLM/VLM dependencies."""
    if not changed_regions:
        return {
            "enriched": False,
            "fallback": False,
            "provider": "local_heuristic",
            "summary": "No changed regions to analyze.",
            "component_type": "none",
        }

    return generate_local_heuristic_analysis(changed_regions, window_metadata)

