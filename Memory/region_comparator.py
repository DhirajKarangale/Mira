from __future__ import annotations

import difflib
import re
from typing import Any, Dict, List, Optional, Tuple

def calculate_bbox_iou(b1: List[int], b2: List[int]) -> float:
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
    if not text:
        return ""

    t = text.lower()

    t = re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b", "", t)

    t = re.sub(r"\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b", "", t)

    t = re.sub(r"\b\d+(?:\.\d+)?\s*(?:/\s*(?:min|sec|hr|hour|day)|kb|mb|gb|shots|entries)\b", "", t)

    if mask_numbers:

        t = re.sub(r"\b\d+\b", "#", t)

    t = re.sub(r"[^\w\s]", " ", t)

    return " ".join(t.split())

def compare_ui_regions(
    previous_regions: Optional[List[Dict[str, Any]]],
    current_regions: Optional[List[Dict[str, Any]]],
    previous_text: str = "",
    current_text: str = "",
) -> Dict[str, Any]:
    prev_list = previous_regions or []
    curr_list = current_regions or []

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

    meaningful_added = [
        r for r in added
        if len(normalize_text(r.get("corrected_text") or r.get("text", ""))) >= 3
    ]

    total_changed = len(modified) + len(added) + len(removed)
    total_meaningful_changed = len(meaningful_modified) + len(meaningful_added) + len(removed)
    has_changes = total_changed > 0
    has_meaningful_changes = total_meaningful_changed > 0

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

def is_somewhat_similar(
    region_changes: Dict[str, Any],
    diff_score: Optional[float] = None,
    similarity_threshold: float = 0.85,
) -> Tuple[bool, str]:
    """
    Evaluates whether the current frame is 'somewhat similar' to the baseline frame
    and can be ignored to avoid spamming summarization with micro-updates.
    """
    if not region_changes.get("has_changes", False):
        if diff_score is not None and diff_score >= 0.015:
            return False, f"Visual pixel change detected (diff={diff_score:.4f})"
        return True, "No region changes detected"

    # If the visual difference across the entire screen is noticeable (>= 5%), layout/content shifted
    if diff_score is not None and diff_score >= 0.05:
        return False, f"Major visual layout shift (diff={diff_score:.3f})"

    # Check for modals, alerts, warnings, or prompts that require attention
    for r in region_changes.get("added_regions", []):
        rtype = str(r.get("type", "")).lower()
        rtext = str(r.get("text", "")).lower()
        if rtype == "modal" or any(kw in rtext for kw in ("dialog", "alert", "confirm", "warning", "error", "prompt")):
            return False, f"Modal/alert UI element appeared: {rtext[:35]}"

    for r in region_changes.get("meaningful_modified_regions", []):
        rtype = str(r.get("type", "")).lower()
        if rtype == "modal":
            return False, "Modal state updated"

    overall_sim = float(region_changes.get("overall_text_similarity", 1.0))
    meaningful_count = int(region_changes.get("total_meaningful_changed", 0))

    # If overall text similarity is high (>= similarity_threshold, default 85% identical)
    if overall_sim >= similarity_threshold:
        if meaningful_count >= 3:
            return False, f"{meaningful_count} distinct regions modified despite high text similarity"
        if diff_score is not None and diff_score >= 0.035:
            return False, f"Substantial visual change (diff={diff_score:.4f}) despite text similarity"
        return True, f"Text similarity {overall_sim:.1%} >= {similarity_threshold:.1%} (ignoring minor updates)"

    # If there are zero meaningful changes and visual difference is minor (< 2.5%)
    if meaningful_count == 0 and (diff_score is None or diff_score < 0.025):
        return True, f"Zero meaningful content changes (overall_sim={overall_sim:.1%})"

    return False, f"Meaningful change detected (similarity={overall_sim:.1%}, {meaningful_count} changed region(s))"

