from __future__ import annotations

import difflib
import re
from typing import Any, Dict, List, Optional, Tuple


def calculate_bbox_iou(b1: List[int], b2: List[int]) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes [x, y, w, h]."""
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2

    xi1 = max(x1, x2)
    yi1 = max(y1, y2)
    xi2 = min(x1 + w1, x2 + w2)
    yi2 = min(y1 + h1, y2 + h2)

    inter_w = max(0, xi2 - xi1)
    inter_h = max(0, yi2 - yi1)
    inter_area = inter_w * inter_h

    area1 = max(0, w1) * max(0, h1)
    area2 = max(0, w2) * max(0, h2)
    union_area = area1 + area2 - inter_area

    if union_area <= 0:
        return 0.0
    return float(inter_area) / float(union_area)


def normalize_text(text: str, mask_numbers: bool = False) -> str:
    """
    Normalize text to eliminate OCR noise, fluctuating timestamps, and transient numbers.
    Used for reliable deduplication across screenshots.
    """
    if not text:
        return ""

    t = text.lower()
    # Remove timestamps: HH:MM or HH:MM:SS AM/PM
    t = re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b", "", t)
    # Remove dates: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY
    t = re.sub(r"\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b", "", t)
    # Remove rate and volume units
    t = re.sub(r"\b\d+(?:\.\d+)?\s*(?:/\s*(?:min|sec|hr|hour|day)|kb|mb|gb|shots|entries)\b", "", t)

    if mask_numbers:
        # Mask variable digits to match structural templates
        t = re.sub(r"\b\d+\b", "#", t)

    # Strip symbols and punctuation
    t = re.sub(r"[^\w\s]", " ", t)
    # Collapse whitespace
    return " ".join(t.split())


def compare_ui_regions(
    previous_regions: Optional[List[Dict[str, Any]]],
    current_regions: Optional[List[Dict[str, Any]]],
    previous_text: str = "",
    current_text: str = "",
) -> Dict[str, Any]:
    """
    Compare current UI regions against previous UI regions for the same application.
    Identifies added, removed, modified, and unchanged UI regions.
    Distinguishes meaningful changes from transient noise (e.g. clock ticks or minor counter updates).

    Returns:
        Dict[str, Any]:
            has_changes: bool
            has_meaningful_changes: bool
            total_changed: int
            total_meaningful_changed: int
            modified_regions: list of modified regions
            meaningful_modified_regions: list of modified regions with meaningful content change
            added_regions: list of new regions
            removed_regions: list of vanished regions
            unchanged_regions: list of identical regions
            overall_text_similarity: float (0.0 to 1.0)
            change_summary: human-readable string summary
    """
    prev_list = previous_regions or []
    curr_list = current_regions or []

    # Calculate overall text similarity on normalized text
    norm_prev_full = normalize_text(previous_text, mask_numbers=True)
    norm_curr_full = normalize_text(current_text, mask_numbers=True)

    if norm_prev_full or norm_curr_full:
        overall_sim = difflib.SequenceMatcher(None, norm_prev_full, norm_curr_full).ratio()
    else:
        overall_sim = 1.0 if not prev_list and not curr_list else 0.0

    if not prev_list and not curr_list:
        return {
            "has_changes": False,
            "has_meaningful_changes": False,
            "total_changed": 0,
            "total_meaningful_changed": 0,
            "modified_regions": [],
            "meaningful_modified_regions": [],
            "added_regions": [],
            "removed_regions": [],
            "unchanged_regions": [],
            "overall_text_similarity": 1.0,
            "change_summary": "No UI regions present.",
        }

    if not prev_list and curr_list:
        return {
            "has_changes": True,
            "has_meaningful_changes": True,
            "total_changed": len(curr_list),
            "total_meaningful_changed": len(curr_list),
            "modified_regions": [],
            "meaningful_modified_regions": [],
            "added_regions": curr_list,
            "removed_regions": [],
            "unchanged_regions": [],
            "overall_text_similarity": round(overall_sim, 3),
            "change_summary": f"Initial screen: {len(curr_list)} region(s) detected.",
        }

    matched_prev_indices = set()
    modified: List[Dict[str, Any]] = []
    meaningful_modified: List[Dict[str, Any]] = []
    unchanged: List[Dict[str, Any]] = []
    added: List[Dict[str, Any]] = []

    for curr in curr_list:
        curr_id = curr.get("region_id", "")
        curr_bbox = curr.get("bbox", [0, 0, 0, 0])
        curr_text = curr.get("corrected_text") or curr.get("text", "").strip()

        best_score = -1.0
        best_match: Optional[Tuple[int, Dict[str, Any], float]] = None

        # 1. First priority: match by stable region_id if available
        for p_idx, prev in enumerate(prev_list):
            if p_idx in matched_prev_indices:
                continue
            prev_id = prev.get("region_id", "")
            if curr_id and prev_id and curr_id == prev_id:
                prev_text = prev.get("corrected_text") or prev.get("text", "").strip()
                sim = difflib.SequenceMatcher(None, curr_text, prev_text).ratio()
                best_score = 1.0
                best_match = (p_idx, prev, sim)
                break

        # 2. Second priority: spatial IoU + proximity match
        if not best_match:
            curr_cx = curr_bbox[0] + (curr_bbox[2] / 2.0)
            curr_cy = curr_bbox[1] + (curr_bbox[3] / 2.0)

            for p_idx, prev in enumerate(prev_list):
                if p_idx in matched_prev_indices:
                    continue

                prev_bbox = prev.get("bbox", [0, 0, 0, 0])
                prev_text = prev.get("corrected_text") or prev.get("text", "").strip()

                iou = calculate_bbox_iou(curr_bbox, prev_bbox)
                prev_cx = prev_bbox[0] + (prev_bbox[2] / 2.0)
                prev_cy = prev_bbox[1] + (prev_bbox[3] / 2.0)
                dist_score = max(0.0, 1.0 - ((abs(curr_cx - prev_cx) + abs(curr_cy - prev_cy)) / 500.0))
                text_sim = difflib.SequenceMatcher(None, curr_text, prev_text).ratio()
                type_bonus = 0.15 if curr.get("type") == prev.get("type") else 0.0

                composite = (iou * 0.45) + (dist_score * 0.25) + (text_sim * 0.30) + type_bonus
                if composite > best_score and (iou > 0.10 or dist_score > 0.65 or text_sim > 0.60):
                    best_score = composite
                    best_match = (p_idx, prev, text_sim)

        if best_match:
            p_idx, prev, text_sim = best_match
            matched_prev_indices.add(p_idx)

            prev_text_val = prev.get("corrected_text") or prev.get("text", "").strip()

            # Check normalized equality (masking numbers)
            norm_curr = normalize_text(curr_text, mask_numbers=True)
            norm_prev = normalize_text(prev_text_val, mask_numbers=True)
            is_meaningful = (norm_curr != norm_prev) and (text_sim < 0.94)

            if text_sim < 0.98 or curr_text != prev_text_val:
                mod_entry = {
                    "region_id": curr.get("region_id", ""),
                    "type": curr.get("type", "content"),
                    "bbox": curr_bbox,
                    "previous_text": prev_text_val,
                    "current_text": curr_text,
                    "similarity": round(text_sim, 3),
                    "is_meaningful": is_meaningful,
                    "confidence": curr.get("confidence", 80.0),
                }
                modified.append(mod_entry)
                if is_meaningful:
                    meaningful_modified.append(mod_entry)
            else:
                unchanged.append(curr)
        else:
            added.append(curr)

    removed = [p for i, p in enumerate(prev_list) if i not in matched_prev_indices]

    # Filter out added regions that are empty or pure noise
    meaningful_added = [
        r for r in added
        if len(normalize_text(r.get("corrected_text") or r.get("text", ""))) >= 3
    ]

    total_changed = len(modified) + len(added) + len(removed)
    total_meaningful_changed = len(meaningful_modified) + len(meaningful_added) + len(removed)
    has_changes = total_changed > 0
    has_meaningful_changes = total_meaningful_changed > 0

    # Summary
    summary_parts = []
    if meaningful_modified:
        summary_parts.append(f"{len(meaningful_modified)} modified")
    if meaningful_added:
        summary_parts.append(f"{len(meaningful_added)} added")
    if removed:
        summary_parts.append(f"{len(removed)} removed")

    if summary_parts:
        change_summary = f"Meaningful changes: {', '.join(summary_parts)} region(s)."
    elif modified:
        change_summary = f"Transient updates only ({len(modified)} minor/counter region(s))."
    else:
        change_summary = "No region changes detected."

    return {
        "has_changes": has_changes,
        "has_meaningful_changes": has_meaningful_changes,
        "total_changed": total_changed,
        "total_meaningful_changed": total_meaningful_changed,
        "modified_regions": modified,
        "meaningful_modified_regions": meaningful_modified,
        "added_regions": added,
        "removed_regions": removed,
        "unchanged_regions": unchanged,
        "overall_text_similarity": round(overall_sim, 3),
        "change_summary": change_summary,
    }
