from __future__ import annotations

import math
import os
import re
import shutil
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from vault_logger import log, log_error
from .config import get_knowledge_base_dir, get_kb_retention_period
from .protection import kb_protector

KB_NAME_PATTERN = re.compile(r"^kb-(\d{2})_(\d{2})_(\d{4})-(\d{2})_(\d{2})_(\d{4})$")

def parse_query_date(d_str: Optional[str]) -> Optional[datetime]:
    """Parses various date string formats into a datetime object for filtering."""
    if not d_str:
        return None
    s = str(d_str).strip()
    for fmt in (
        "%Y-%m-%d",
        "%d_%m_%Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    try:
        # Check numeric Unix timestamp
        ts = float(s)
        return datetime.fromtimestamp(ts)
    except Exception:
        pass
    return None

def get_dir_size_bytes(dir_path: Path) -> int:
    """Calculates total disk storage size of a directory in bytes."""
    try:
        total = 0
        for entry in os.scandir(dir_path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size_bytes(Path(entry.path))
        return total
    except Exception:
        return 0

def calculate_retention_cutoff(
    retention_str: Optional[str],
    now: Optional[datetime] = None
) -> Optional[datetime]:
    """Calculates the cutoff datetime for a Knowledge Base retention policy.
    
    Knowledge Bases with end_datetime < cutoff are considered expired.
    Returns None if 'Never auto delete', empty, or disabled.
    """
    if not retention_str:
        return None

    clean = str(retention_str).strip().lower()
    if clean in ("never auto delete", "never", "none", "disabled", "0"):
        return None

    ref = now or datetime.now()

    if "5 year" in clean:
        try:
            return ref.replace(year=ref.year - 5)
        except ValueError:
            return ref - timedelta(days=5 * 365 + 1)
    elif "3 year" in clean:
        try:
            return ref.replace(year=ref.year - 3)
        except ValueError:
            return ref - timedelta(days=3 * 365)
    elif "1 year" in clean:
        try:
            return ref.replace(year=ref.year - 1)
        except ValueError:
            return ref - timedelta(days=365)
    elif "9 month" in clean:
        month = ref.month - 9
        year = ref.year
        while month <= 0:
            month += 12
            year -= 1
        day = min(ref.day, 28)
        return datetime(year, month, day, ref.hour, ref.minute, ref.second)
    elif "6 month" in clean:
        month = ref.month - 6
        year = ref.year
        while month <= 0:
            month += 12
            year -= 1
        day = min(ref.day, 28)
        return datetime(year, month, day, ref.hour, ref.minute, ref.second)
    elif "3 month" in clean:
        month = ref.month - 3
        year = ref.year
        while month <= 0:
            month += 12
            year -= 1
        day = min(ref.day, 28)
        return datetime(year, month, day, ref.hour, ref.minute, ref.second)

    return None

class KnowledgeBaseStorage:
    """Manages discovery, selection, deletion, and monthly lifecycle of Qdrant Knowledge Bases.

    - Stores Qdrant Knowledge Bases directly under vault/system/knowledge_base/.
    - Checks and validates names using format: kb-DD_MM_YYYY-DD_MM_YYYY.
    - Selects and reuses the Knowledge Base whose date range belongs to the current month.
    - If none exists for the current month, creates a new one: kb-currentdate-currentdate.
    - Keeps the start date constant after creation.
    - Updates the end date to the current date only when new data is successfully ingested.
    - Provides paginated listing with date-based filtering and metadata.
    - Safely removes Knowledge Base directories upon deletion.
    """

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self._custom_base_dir: Optional[Path] = base_dir
        self._lock: threading.RLock = threading.RLock()
        self._active_kb_path: Optional[Path] = None
        self._active_kb_name: Optional[str] = None
        self._start_date_str: Optional[str] = None
        self._end_date_str: Optional[str] = None

    @property
    def base_dir(self) -> Path:
        if self._custom_base_dir:
            self._custom_base_dir.mkdir(parents=True, exist_ok=True)
            return self._custom_base_dir
        return get_knowledge_base_dir()

    def parse_kb_name(self, folder_name: str) -> Optional[Dict[str, Any]]:
        """Parses a folder name matching kb-DD_MM_YYYY-DD_MM_YYYY."""
        match = KB_NAME_PATTERN.match(folder_name)
        if not match:
            return None

        d1, m1, y1 = int(match.group(1)), int(match.group(2)), int(match.group(3))
        d2, m2, y2 = int(match.group(4)), int(match.group(5)), int(match.group(6))

        try:
            start_dt = datetime(y1, m1, d1)
            end_dt = datetime(y2, m2, d2)
        except ValueError:
            return None

        start_str = f"{d1:02d}_{m1:02d}_{y1:04d}"
        end_str = f"{d2:02d}_{m2:02d}_{y2:04d}"

        now = datetime.now()
        is_current_month = (start_dt.year == now.year and start_dt.month == now.month)

        return {
            "name": folder_name,
            "start_date": start_str,
            "end_date": end_str,
            "start_datetime": start_dt,
            "end_datetime": end_dt,
            "is_current_month": is_current_month,
        }

    def list_knowledge_bases(self) -> List[Dict[str, Any]]:
        """Retrieves all existing Knowledge Bases formatted as kb-DD_MM_YYYY-DD_MM_YYYY,
        verifying canonical names and ensuring active folder protection.
        """
        with self._lock:
            kb_dir = self.base_dir
            if not kb_dir.exists():
                return []

            # Self-heal any unauthorized offline folder renames and lock all folders
            kb_protector.sync_and_protect_all(kb_dir)

            results: List[Dict[str, Any]] = []
            for item in kb_dir.iterdir():
                if item.is_dir():
                    parsed = self.parse_kb_name(item.name)
                    if parsed:
                        parsed["path"] = str(item.resolve())
                        parsed["is_active"] = True  # Consider all Knowledge Bases active
                        results.append(parsed)

            # Sort by end_datetime descending, then start_datetime descending (newest first)
            results.sort(key=lambda x: (x["end_datetime"], x["start_datetime"]), reverse=True)
            return results

    def get_knowledge_bases_paginated(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 10,
        get_point_count_cb: Optional[Callable[[Path], int]] = None,
    ) -> Dict[str, Any]:
        """Lists Knowledge Bases with date-based filtering and pagination metadata, treating all KBs as active."""
        with self._lock:
            all_kbs = self.list_knowledge_bases()

            q_start = parse_query_date(start_date)
            q_end = parse_query_date(end_date)
            q_search = str(search).strip().lower() if search else None

            filtered_kbs: List[Dict[str, Any]] = []
            for kb in all_kbs:
                kb_start: datetime = kb["start_datetime"]
                kb_end: datetime = kb["end_datetime"]

                # Date-based filtering
                if q_start and q_end:
                    # Overlap condition: KB was active during [q_start, q_end]
                    if kb_end < q_start or kb_start > q_end:
                        continue
                elif q_start:
                    if kb_end < q_start:
                        continue
                elif q_end:
                    if kb_start > q_end:
                        continue

                # Search filtering
                if q_search:
                    name_match = q_search in kb["name"].lower()
                    date_match = q_search in kb["start_date"] or q_search in kb["end_date"]
                    if not (name_match or date_match):
                        continue

                kb_path = Path(kb["path"])
                days_coverage = max(1, (kb_end - kb_start).days + 1)

                # Point count via callback if provided
                points_count = 0
                if get_point_count_cb:
                    try:
                        points_count = get_point_count_cb(kb_path)
                    except Exception:
                        points_count = 0

                size_bytes = get_dir_size_bytes(kb_path)

                filtered_kbs.append({
                    "name": kb["name"],
                    "start_date": kb["start_date"],
                    "end_date": kb["end_date"],
                    "start_date_formatted": kb_start.strftime("%Y-%m-%d"),
                    "end_date_formatted": kb_end.strftime("%Y-%m-%d"),
                    "days_coverage": days_coverage,
                    "is_current_month": kb["is_current_month"],
                    "is_active": True,  # All Knowledge Bases are considered active
                    "points_count": points_count,
                    "size_bytes": size_bytes,
                    "path": kb["path"],
                })

            total = len(filtered_kbs)
            page_num = max(1, int(page))
            limit_num = max(1, min(int(limit), 100))
            total_pages = max(1, math.ceil(total / limit_num)) if total > 0 else 1

            start_idx = (page_num - 1) * limit_num
            end_idx = start_idx + limit_num
            page_items = filtered_kbs[start_idx:end_idx]

            return {
                "status": "success",
                "total": total,
                "page": page_num,
                "limit": limit_num,
                "total_pages": total_pages,
                "knowledge_bases": page_items,
            }

    def delete_knowledge_base(
        self,
        name: str,
        before_delete_cb: Optional[Callable[[], None]] = None,
        after_delete_cb: Optional[Callable[[], None]] = None,
    ) -> bool:
        """Deletes a specific Knowledge Base directory safely by its name."""
        with self._lock:
            clean_name = str(name or "").strip()
            if not clean_name or not KB_NAME_PATTERN.match(clean_name):
                raise ValueError(
                    f"Invalid Knowledge Base name format: '{clean_name}'. Must match 'kb-DD_MM_YYYY-DD_MM_YYYY'."
                )

            target_dir = self.base_dir / clean_name
            if not target_dir.exists() or not target_dir.is_dir():
                raise FileNotFoundError(f"Knowledge Base '{clean_name}' does not exist.")

            is_active = False
            if self._active_kb_path:
                try:
                    is_active = (self._active_kb_path.resolve() == target_dir.resolve())
                except Exception:
                    is_active = (self._active_kb_name == clean_name)

            if before_delete_cb:
                try:
                    before_delete_cb()
                except Exception as e:
                    log_error(f"[KnowledgeBaseStorage] Callback before delete failed: {e}")

            # Unlock folder sharing lock so Windows kernel permits deletion
            kb_protector.unlock_folder(target_dir)

            if is_active:
                self._active_kb_path = None
                self._active_kb_name = None
                self._start_date_str = None
                self._end_date_str = None

            # Retry deletion up to 5 times for Windows file locks
            deleted = False
            for attempt in range(5):
                try:
                    shutil.rmtree(target_dir)
                    deleted = True
                    break
                except (PermissionError, OSError):
                    time.sleep(0.15)

            if not deleted:
                shutil.rmtree(target_dir)

            log(f"[KnowledgeBaseStorage] Successfully deleted Knowledge Base: '{clean_name}'")

            if after_delete_cb:
                try:
                    after_delete_cb()
                except Exception as e:
                    log_error(f"[KnowledgeBaseStorage] Callback after delete failed: {e}")

            return True

    def cleanup_expired_knowledge_bases(
        self,
        retention_period: Optional[str] = None,
        now: Optional[datetime] = None,
        delete_fn: Optional[Callable[[str], None]] = None,
    ) -> List[str]:
        """Identifies and automatically deletes Knowledge Bases older than the configured retention period.
        
        - If retention is 'Never auto delete' or None, returns without deleting.
        - Never deletes the active Knowledge Base or current month collection.
        """
        with self._lock:
            if retention_period is None:
                retention_period = get_kb_retention_period()

            cutoff = calculate_retention_cutoff(retention_period, now=now)
            if cutoff is None:
                log(f"[KnowledgeBaseStorage] Knowledge Base retention is set to '{retention_period}'. No automatic deletion performed.")
                return []

            all_kbs = self.list_knowledge_bases()
            active_name = self._active_kb_name or (self.get_active_kb_name() if all_kbs else "")
            deleted_names: List[str] = []

            log(f"[KnowledgeBaseStorage] Checking retention cutoff {cutoff.strftime('%Y-%m-%d')} for policy '{retention_period}'...")

            for kb in all_kbs:
                kb_name = kb["name"]
                # Never auto-delete active Knowledge Base or current month
                if kb_name == active_name or kb.get("is_current_month"):
                    continue

                kb_end: datetime = kb["end_datetime"]
                if kb_end < cutoff:
                    log(f"[KnowledgeBaseStorage] Knowledge Base '{kb_name}' (end_date: {kb_end.strftime('%Y-%m-%d')}) is older than retention period '{retention_period}'. Deleting...")
                    try:
                        if delete_fn:
                            delete_fn(kb_name)
                        else:
                            self.delete_knowledge_base(kb_name)
                        deleted_names.append(kb_name)
                    except Exception as e:
                        log_error(f"[KnowledgeBaseStorage] Failed to delete expired Knowledge Base '{kb_name}': {e}")

            return deleted_names

    def get_active_knowledge_base(self) -> Path:
        """Selects and reuses the Knowledge Base for the current month, or creates a new one."""
        with self._lock:
            now = datetime.now()

            # If we already have an active KB, verify it still belongs to the current month
            if self._active_kb_path and self._active_kb_path.exists():
                parsed = self.parse_kb_name(self._active_kb_path.name)
                if parsed and parsed["is_current_month"]:
                    return self._active_kb_path

            # Retrieve all existing KBs and look for one belonging to the current month
            all_kbs = self.list_knowledge_bases()
            current_month_kbs = [k for k in all_kbs if k["is_current_month"]]

            if current_month_kbs:
                # Select the most recent Knowledge Base belonging to the current month
                selected = current_month_kbs[0]
                self._active_kb_path = Path(selected["path"])
                self._active_kb_name = selected["name"]
                self._start_date_str = selected["start_date"]
                self._end_date_str = selected["end_date"]
                kb_protector.create_or_update_manifest(self._active_kb_path, self._active_kb_name)
                kb_protector.lock_folder(self._active_kb_path)
                log(f"[KnowledgeBaseStorage] Reusing Knowledge Base for current month: {self._active_kb_name}")
                return self._active_kb_path

            # If none exists for the current month, create a new Knowledge Base named kb-currentdate-currentdate
            current_date_str = now.strftime("%d_%m_%Y")
            new_kb_name = f"kb-{current_date_str}-{current_date_str}"
            new_kb_path = self.base_dir / new_kb_name
            new_kb_path.mkdir(parents=True, exist_ok=True)

            self._active_kb_path = new_kb_path
            self._active_kb_name = new_kb_name
            self._start_date_str = current_date_str
            self._end_date_str = current_date_str

            # Create encrypted manifest and apply mandatory folder lock
            kb_protector.create_or_update_manifest(new_kb_path, new_kb_name)
            kb_protector.lock_folder(new_kb_path)

            log(f"[KnowledgeBaseStorage] Created new Knowledge Base for current month: {new_kb_name}")
            return self._active_kb_path

    def get_active_kb_name(self) -> str:
        """Returns the active Knowledge Base directory name."""
        with self._lock:
            if not self._active_kb_name or not self._active_kb_path or not self._active_kb_path.exists():
                self.get_active_knowledge_base()
            return self._active_kb_name or ""

    def get_active_kb_path(self) -> Path:
        """Returns the active Knowledge Base directory path."""
        with self._lock:
            return self.get_active_knowledge_base()

    def update_end_date_on_ingestion(
        self,
        before_rename_cb: Optional[Callable[[], None]] = None,
        after_rename_cb: Optional[Callable[[Path], None]] = None,
    ) -> Path:
        """Updates the end date of the active Knowledge Base to the current date upon successful data ingestion."""
        with self._lock:
            active_path = self.get_active_knowledge_base()
            parsed = self.parse_kb_name(active_path.name)
            if not parsed:
                return active_path

            start_date_str = parsed["start_date"]
            old_end_date_str = parsed["end_date"]
            today_str = datetime.now().strftime("%d_%m_%Y")

            if old_end_date_str == today_str:
                return active_path

            new_kb_name = f"kb-{start_date_str}-{today_str}"
            new_kb_path = self.base_dir / new_kb_name

            if new_kb_path.exists() and new_kb_path != active_path:
                kb_protector.unlock_folder(active_path)
                if before_rename_cb:
                    before_rename_cb()
                self._active_kb_path = new_kb_path
                self._active_kb_name = new_kb_name
                self._start_date_str = start_date_str
                self._end_date_str = today_str
                kb_protector.create_or_update_manifest(new_kb_path, new_kb_name)
                kb_protector.lock_folder(new_kb_path)
                kb_protector.encrypt_folder_snapshot(new_kb_path)
                if after_rename_cb:
                    after_rename_cb(new_kb_path)
                log(f"[KnowledgeBaseStorage] Switched active KB to existing target path: {new_kb_name}")
                return new_kb_path

            kb_protector.unlock_folder(active_path)
            if before_rename_cb:
                try:
                    before_rename_cb()
                except Exception as e:
                    log_error(f"[KnowledgeBaseStorage] Callback before rename failed: {e}")

            try:
                active_path.rename(new_kb_path)
                self._active_kb_path = new_kb_path
                self._active_kb_name = new_kb_name
                self._start_date_str = start_date_str
                self._end_date_str = today_str
                kb_protector.create_or_update_manifest(new_kb_path, new_kb_name)
                kb_protector.lock_folder(new_kb_path)
                kb_protector.encrypt_folder_snapshot(new_kb_path)
                log(f"[KnowledgeBaseStorage] Updated Knowledge Base end date: '{parsed['name']}' -> '{new_kb_name}'")
            except Exception as e:
                log_error(f"[KnowledgeBaseStorage] Failed to rename '{active_path}' to '{new_kb_path}': {e}")
                kb_protector.lock_folder(active_path)
                return active_path
            finally:
                if after_rename_cb:
                    try:
                        after_rename_cb(self._active_kb_path)
                    except Exception as e:
                        log_error(f"[KnowledgeBaseStorage] Callback after rename failed: {e}")

            return self._active_kb_path

# Global singleton
kb_storage = KnowledgeBaseStorage()
