from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import pytesseract
from pytesseract import Output

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


def _read_image(image_path: Union[str, Path, np.ndarray]) -> np.ndarray:
    if isinstance(image_path, np.ndarray):
        return image_path

    path_str = str(image_path)
    if not os.path.exists(path_str):
        raise FileNotFoundError(f"Image not found at path: {path_str}")

    try:
        data = np.fromfile(path_str, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        img = cv2.imread(path_str, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError(f"Unable to read or decode image file: {path_str}")

    return img


def is_browser_application(app_name: str) -> bool:
    """Check if the application is a web browser."""
    app_lower = app_name.lower()
    return any(b in app_lower for b in ("edge", "chrome", "firefox", "brave", "opera", "safari", "browser"))


def is_mira_self_page(text: str, app_name: str = "") -> bool:
    """
    Check if the screen content belongs to MIRA's own interface (logs, telemetry, configs),
    to prevent infinite feedback capture loops.
    """
    t_lower = text.lower()
    mira_indicators = (
        "127.0.0.1:9004",
        "localhost:9004",
        "/activity/redis",
        "/activity/logs",
        "/activity/captured-data",
        "/activity/configurations",
        "consumer_group_ocr_extraction",
        "consumer_group_ocr_text_summarization",
        "mira:stream:ocr_",
        "real-time redis telemetry",
        "vault managed",
    )
    return any(ind in t_lower for ind in mira_indicators)


def classify_token_irrelevant(
    bbox: List[int],
    text: str,
    img_w: int,
    img_h: int,
    is_browser: bool,
) -> Optional[str]:
    """
    Determine if a token belongs to an irrelevant or noise UI region:
    - browser_tab: top browser tab strip (y < 44px on 1080p)
    - browser_nav: browser address bar / navigation (44px <= y <= 85px)
    - taskbar: bottom OS taskbar (y >= img_h - 52px)
    - noise: stray single-glyph or isolated punctuation
    """
    x, y, w, h = bbox
    t_clean = text.strip()

    # Bottom taskbar
    if y >= max(0, img_h - 52) or (y / max(img_h, 1)) >= 0.95:
        return "taskbar"

    # Browser chrome
    if is_browser:
        if y < 44 or (y / max(img_h, 1)) < 0.042:
            return "browser_tab"
        if 44 <= y <= 85 and any(proto in t_clean.lower() for proto in ("http:", "https:", "127.0.0.1", "localhost", "www.", ".com")):
            return "browser_nav"

    # Single-glyph noise
    if len(t_clean) <= 1 and not t_clean.isalnum():
        return "symbol_noise"
    if t_clean in ("©", "€", "€&", "+ x", "OW x", "~", "|"):
        return "symbol_noise"

    return None


def clean_ocr_text(text: str) -> str:
    """Clean known Tesseract OCR artifacts and misreads."""
    if not text:
        return ""

    t = text
    # Fix common ligature / OCR misread patterns
    t = re.sub(r"\bMIRA\s+LIEN\b", "MIRA CLIENT", t, flags=re.IGNORECASE)
    t = re.sub(r"\bussrcesnoxen\b", "MESSAGE_BROKER", t, flags=re.IGNORECASE)
    t = re.sub(r"\boMIRA\b", "MIRA", t)
    t = re.sub(r"\bJobora\s+A[P™]\s*GS\b", "Jobora App", t)
    t = re.sub(r"Clean\s*[‘'`]?\s*J\s*Delete", "Clean / Delete", t)

    # Remove non-printable / control characters
    t = "".join(c for c in t if c.isprintable() or c in ("\n", "\t", " "))
    # Collapse duplicate whitespace
    return " ".join(t.split())


def reprocess_low_confidence_region(
    img: np.ndarray,
    bbox: List[int],
    initial_text: str,
    confidence: float,
) -> str:
    """
    Perform a secondary OCR pass on low-confidence regions using image preprocessing
    (upscaling, CLAHE contrast enhancement, and adaptive thresholding).
    Preserves initial_text if secondary pass yields empty output.
    """
    # Only reprocess if confidence is low (< 75.0) or text has obvious garbage patterns
    has_garbage = bool(re.search(r"[^\x00-\x7F]{2,}", initial_text)) or "LIEN" in initial_text or "ussr" in initial_text.lower()
    if confidence >= 75.0 and not has_garbage:
        return clean_ocr_text(initial_text)

    x, y, w, h = bbox
    h_img, w_img = img.shape[:2]
    # Add slight padding
    x1 = max(0, x - 4)
    y1 = max(0, y - 4)
    x2 = min(w_img, x + w + 4)
    y2 = min(h_img, y + h + 4)

    if x2 <= x1 or y2 <= y1:
        return clean_ocr_text(initial_text)

    crop = img[y1:y2, x1:x2]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop

    try:
        # 1. Scale up for small fonts
        scale_factor = 2 if gray.shape[0] < 50 else 1
        if scale_factor > 1:
            gray = cv2.resize(gray, (gray.shape[1] * scale_factor, gray.shape[0] * scale_factor), interpolation=cv2.INTER_CUBIC)

        # 2. Contrast enhancement via CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        contrast = clahe.apply(gray)

        # 3. Adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )

        # 4. Secondary OCR pass with PSM 6 (uniform block)
        sec_text = pytesseract.image_to_string(thresh, config="--psm 6").strip()
        cleaned_sec = clean_ocr_text(sec_text)

        if cleaned_sec and len(cleaned_sec) >= 2:
            return cleaned_sec
    except Exception as e:
        log(f"Secondary OCR pass failed for bbox {bbox}: {e}")

    return clean_ocr_text(initial_text)


def extract_text_from_image(image_path: Union[str, Path, np.ndarray]) -> str:
    """Extract text from the specified image path using OCR (Tesseract)."""
    img = _read_image(image_path)
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        text = pytesseract.image_to_string(gray)
        return text.strip()
    except Exception as e:
        log(f"OCR extraction failed for '{image_path}': {e}")
        return ""


extract_text = extract_text_from_image


def extract_pixels_and_grayscale(image_path: Union[str, Path, np.ndarray]) -> Tuple[np.ndarray, np.ndarray]:
    """Extract pixel values and grayscale matrix from an image path."""
    img = _read_image(image_path)
    if len(img.shape) == 3:
        grayscale = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        grayscale = img
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return img, grayscale


extract_image_data = extract_pixels_and_grayscale


def extract_ocr_tokens(image_path: Union[str, Path, np.ndarray]) -> Tuple[List[Dict[str, Any]], Tuple[int, int]]:
    """
    Extract OCR tokens with bounding boxes and confidence scores using pytesseract image_to_data.
    Returns (tokens_list, (image_width, image_height)).
    """
    img = _read_image(image_path)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    try:
        data = pytesseract.image_to_data(gray, output_type=Output.DICT)
    except Exception as e:
        log(f"Tesseract image_to_data failed: {e}")
        return [], (w, h)

    tokens: List[Dict[str, Any]] = []
    num_boxes = len(data.get("text", []))

    for i in range(num_boxes):
        text = str(data["text"][i]).strip()
        if not text:
            continue

        try:
            conf = float(data["conf"][i])
        except (ValueError, TypeError):
            conf = -1.0

        if 0 <= conf < 10.0:
            continue

        left = int(data["left"][i])
        top = int(data["top"][i])
        width = int(data["width"][i])
        height = int(data["height"][i])

        tokens.append({
            "text": text,
            "bbox": [left, top, width, height],
            "confidence": round(conf, 2) if conf >= 0 else 75.0,
            "block_num": int(data.get("block_num", [0])[i]),
            "line_num": int(data.get("line_num", [0])[i]),
            "par_num": int(data.get("par_num", [0])[i]),
        })

    return tokens, (w, h)


def assign_stable_region_id(
    region_type: str,
    bbox: List[int],
    img_w: int,
    img_h: int,
    existing_ids: set,
) -> str:
    """
    Generate a stable, deterministic region ID based on spatial grid coordinates.
    E.g. header_c3_r0, sidebar_c0_r3, content_c5_r4.
    """
    w_safe = max(img_w, 1)
    h_safe = max(img_h, 1)

    cx = bbox[0] + (bbox[2] / 2.0)
    cy = bbox[1] + (bbox[3] / 2.0)

    # 10x10 spatial grid
    col = min(9, max(0, int((cx / w_safe) * 10)))
    row = min(9, max(0, int((cy / h_safe) * 10)))

    base_id = f"{region_type}_c{col}_r{row}"
    candidate = base_id
    counter = 1
    while candidate in existing_ids:
        candidate = f"{base_id}_{counter}"
        counter += 1

    existing_ids.add(candidate)
    return candidate


def group_text_into_ui_regions(
    tokens: List[Dict[str, Any]],
    image_width: int,
    image_height: int,
    is_browser: bool = False,
    image_matrix: Optional[np.ndarray] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Group OCR text tokens into logical UI regions with:
    1. Line-level segmentation and refined bounding-box overlap handling.
    2. Prevention of runaway header height (max header height 70px).
    3. Column boundary separation (sidebar vs content).
    4. Filtering of browser tabs, navigation bars, taskbars, and stray noise.
    5. Stable spatial region IDs.
    6. Secondary OCR pass on low-confidence regions for corrected_text.

    Returns:
        Tuple[valid_ui_regions, filtered_regions]
    """
    if not tokens:
        return [], []

    w_thresh = max(image_width, 1)
    h_thresh = max(image_height, 1)

    # 1. Filter irrelevant tokens (browser tabs, nav bar, taskbar, symbol noise)
    valid_tokens: List[Dict[str, Any]] = []
    filtered_tokens: List[Dict[str, Any]] = []

    for t in tokens:
        filter_reason = classify_token_irrelevant(t["bbox"], t["text"], w_thresh, h_thresh, is_browser)
        if filter_reason:
            t_copy = dict(t)
            t_copy["filter_reason"] = filter_reason
            filtered_tokens.append(t_copy)
        else:
            valid_tokens.append(t)

    # 2. Segment valid tokens into distinct horizontal text lines
    # Tokens on the same vertical band (|y_diff| <= 8px) belong to the same line
    sorted_tokens = sorted(valid_tokens, key=lambda t: (t["bbox"][1], t["bbox"][0]))
    lines: List[Dict[str, Any]] = []

    for t in sorted_tokens:
        bx, by, bw, bh = t["bbox"]
        assigned = False

        for line in lines:
            lx, ly, lw, lh = line["bbox"]
            # Check if token is on the same vertical line
            same_line = abs(by - ly) <= 8 or (by >= ly - 4 and by <= ly + lh + 4)
            # Check horizontal proximity on the line (gap < 80px)
            horiz_near = (bx >= lx - 20) and (bx <= lx + lw + 80)

            if same_line and horiz_near:
                nx = min(lx, bx)
                ny = min(ly, by)
                nw = max(lx + lw, bx + bw) - nx
                nh = max(ly + lh, by + bh) - ny
                line["bbox"] = [nx, ny, nw, nh]
                line["tokens"].append(t)
                assigned = True
                break

        if not assigned:
            lines.append({
                "bbox": [bx, by, bw, bh],
                "tokens": [t],
            })

    # Sort lines top-to-bottom
    lines.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))

    # 3. Group lines into UI regions with strict height & column constraints
    clusters: List[Dict[str, Any]] = []

    for line in lines:
        lx, ly, lw, lh = line["bbox"]
        norm_y = ly / h_thresh
        norm_x = lx / w_thresh

        # Determine preliminary region type for line
        if norm_y < 0.14:
            line_type = "header"
            max_cluster_height = 70  # Prevent runaway header!
        elif norm_x < 0.22 and lh > 60:
            line_type = "sidebar"
            max_cluster_height = 800
        elif 0.20 <= norm_x <= 0.80 and 0.20 <= norm_y <= 0.70 and lw <= w_thresh * 0.6:
            line_type = "content"
            max_cluster_height = 400
        else:
            line_type = "content"
            max_cluster_height = 350

        assigned = False

        for c in clusters:
            cx, cy, cw, ch = c["bbox"]
            c_type = c["type"]

            # Cannot merge lines of different types (e.g. header cannot merge with content or sidebar)
            if c_type != line_type:
                continue

            # Prevent runaway height
            if (ch + lh) > max_cluster_height:
                continue

            # Prevent merging across distinct horizontal columns
            c_is_sidebar = (cx / w_thresh) < 0.22
            line_is_sidebar = norm_x < 0.22
            if c_is_sidebar != line_is_sidebar:
                continue

            # Check vertical proximity between lines (gap <= 18px)
            vert_gap = ly - (cy + ch)
            vert_ok = -5 <= vert_gap <= 18

            # Check horizontal overlap or close horizontal alignment
            horiz_overlap = max(0, min(cx + cw, lx + lw) - max(cx, lx))
            horiz_ok = (horiz_overlap > 0) or (abs(lx - cx) <= 30)

            if vert_ok and horiz_ok:
                nx = min(cx, lx)
                ny = min(cy, ly)
                nw = max(cx + cw, lx + lw) - nx
                nh = max(cy + ch, ly + lh) - ny
                c["bbox"] = [nx, ny, nw, nh]
                c["tokens"].extend(line["tokens"])
                assigned = True
                break

        if not assigned:
            clusters.append({
                "bbox": [lx, ly, lw, lh],
                "type": line_type,
                "tokens": list(line["tokens"]),
            })

    # 4. Construct structured UI regions with stable IDs & secondary OCR correction
    existing_ids: set = set()
    ui_regions: List[Dict[str, Any]] = []

    for c in clusters:
        bbox = c["bbox"]
        rtype = c["type"]
        stable_id = assign_stable_region_id(rtype, bbox, w_thresh, h_thresh, existing_ids)

        c_tokens = c["tokens"]
        raw_text = " ".join(t["text"] for t in c_tokens)
        confs = [t["confidence"] for t in c_tokens if t.get("confidence", -1) >= 0]
        avg_conf = float(np.mean(confs)) if confs else 80.0

        # Perform secondary OCR pass for low-confidence text if image matrix available
        if image_matrix is not None:
            corrected_text = reprocess_low_confidence_region(image_matrix, bbox, raw_text, avg_conf)
        else:
            corrected_text = clean_ocr_text(raw_text)

        ui_regions.append({
            "region_id": stable_id,
            "type": rtype,
            "bbox": bbox,
            "raw_text": raw_text,
            "corrected_text": corrected_text,
            "text": corrected_text,  # Compatibility alias
            "word_count": len(c_tokens),
            "confidence": round(avg_conf, 2),
            "is_filtered": False,
            "tokens": [
                {
                    "text": t["text"],
                    "bbox": t["bbox"],
                    "confidence": t["confidence"],
                }
                for t in c_tokens
            ],
        })

    # Group filtered tokens into filtered summary regions
    filtered_regions: List[Dict[str, Any]] = []
    if filtered_tokens:
        # Group by reason
        by_reason: Dict[str, List[Dict[str, Any]]] = {}
        for ft in filtered_tokens:
            by_reason.setdefault(ft["filter_reason"], []).append(ft)

        for reason, f_group in by_reason.items():
            f_text = " ".join(t["text"] for t in f_group)
            fx = min(t["bbox"][0] for t in f_group)
            fy = min(t["bbox"][1] for t in f_group)
            fw = max(t["bbox"][0] + t["bbox"][2] for t in f_group) - fx
            fh = max(t["bbox"][1] + t["bbox"][3] for t in f_group) - fy
            filtered_regions.append({
                "region_id": f"filtered_{reason}",
                "type": reason,
                "bbox": [fx, fy, fw, fh],
                "raw_text": f_text,
                "is_filtered": True,
                "filter_reason": reason,
            })

    return ui_regions, filtered_regions


def extract_structured_ocr(
    image_path: Union[str, Path, np.ndarray],
    app_name: str = "",
) -> Dict[str, Any]:
    """
    Extract structured OCR with:
    - Raw OCR text preserved
    - Secondary pass corrected text
    - Refined UI regions with stable IDs
    - Filtered browser chrome & taskbars
    - MIRA self-page detection
    """
    img = _read_image(image_path)
    tokens, (w, h) = extract_ocr_tokens(img)
    is_browser = is_browser_application(app_name)

    ui_regions, filtered_regions = group_text_into_ui_regions(
        tokens=tokens,
        image_width=w,
        image_height=h,
        is_browser=is_browser,
        image_matrix=img,
    )

    raw_full_text = " ".join(t["text"] for t in tokens)
    corrected_full_text = " ".join(r["corrected_text"] for r in ui_regions) if ui_regions else clean_ocr_text(raw_full_text)
    is_mira_self = is_mira_self_page(raw_full_text, app_name)

    return {
        "raw_ocr_text": raw_full_text.strip(),
        "corrected_text": corrected_full_text.strip(),
        "extracted_text": corrected_full_text.strip(),  # Backward compatibility
        "ui_regions": ui_regions,
        "filtered_regions": filtered_regions,
        "tokens": tokens,
        "dimensions": {"width": w, "height": h},
        "is_browser": is_browser,
        "is_mira_self_page": is_mira_self,
    }
