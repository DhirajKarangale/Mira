from __future__ import annotations

import os
import re
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from vault_logger import log, log_error
from .config import get_knowledge_base_dir

KB_NAME_PATTERN = re.compile(r"^kb-(\d{2})_(\d{2})_(\d{4})-(\d{2})_(\d{2})_(\d{4})$")

class KnowledgeBaseStorage:
    """Manages discovery, selection, and monthly lifecycle of Qdrant Knowledge Bases.

    - Stores Qdrant Knowledge Bases directly under vault/system/knowledge_base/.
    - Checks and validates names using format: kb-DD_MM_YYYY-DD_MM_YYYY.
    - Selects and reuses the Knowledge Base whose date range belongs to the current month.
    - If none exists for the current month, creates a new one: kb-currentdate-currentdate.
    - Keeps the start date constant after creation.
    - Updates the end date to the current date only when new data is successfully ingested.
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
        """Retrieves all existing Knowledge Bases formatted as kb-DD_MM_YYYY-DD_MM_YYYY."""
        with self._lock:
            kb_dir = self.base_dir
            if not kb_dir.exists():
                return []

            results: List[Dict[str, Any]] = []
            for item in kb_dir.iterdir():
                if item.is_dir():
                    parsed = self.parse_kb_name(item.name)
                    if parsed:
                        parsed["path"] = str(item.resolve())
                        results.append(parsed)

            # Sort primarily by start_datetime, then end_datetime descending
            results.sort(key=lambda x: (x["start_datetime"], x["end_datetime"]), reverse=True)
            return results

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
        """Updates the end date of the active Knowledge Base to the current date upon successful data ingestion.

        - Keeps the start date constant after creation.
        - Updates the end date to the current date only when new data is successfully ingested.
        """
        with self._lock:
            active_path = self.get_active_knowledge_base()
            parsed = self.parse_kb_name(active_path.name)
            if not parsed:
                return active_path

            start_date_str = parsed["start_date"]
            old_end_date_str = parsed["end_date"]
            today_str = datetime.now().strftime("%d_%m_%Y")

            # If end date is already the current date, no rename is required
            if old_end_date_str == today_str:
                return active_path

            new_kb_name = f"kb-{start_date_str}-{today_str}"
            new_kb_path = self.base_dir / new_kb_name

            # If the destination directory already exists (edge case), just point to it
            if new_kb_path.exists() and new_kb_path != active_path:
                if before_rename_cb:
                    before_rename_cb()
                self._active_kb_path = new_kb_path
                self._active_kb_name = new_kb_name
                self._start_date_str = start_date_str
                self._end_date_str = today_str
                if after_rename_cb:
                    after_rename_cb(new_kb_path)
                log(f"[KnowledgeBaseStorage] Switched active KB to existing target path: {new_kb_name}")
                return new_kb_path

            # Close vector store connection before directory rename on Windows
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
                log(f"[KnowledgeBaseStorage] Updated Knowledge Base end date: '{parsed['name']}' -> '{new_kb_name}'")
            except Exception as e:
                log_error(f"[KnowledgeBaseStorage] Failed to rename '{active_path}' to '{new_kb_path}': {e}")
                # Keep active path as is if rename failed
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
