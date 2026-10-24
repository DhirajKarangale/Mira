from __future__ import annotations

from datetime import datetime
import logging
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

from .config import get_system_storage_path

logger = logging.getLogger("mira.memory.knowledge_base.storage")

KB_DIR_PATTERN = re.compile(r"^kb_(\d{2})_(\d{2})_(\d{4})$")

class KnowledgeBaseStorage:
    """Manages monthly knowledge base storage directories under the Vault system path."""

    def __init__(self, system_path_override: Optional[Path] = None):
        self._system_path_override = system_path_override

    def get_system_storage_path(self) -> Path:
        if self._system_path_override:
            return self._system_path_override
        return get_system_storage_path()

    def get_kb_root_dir(self) -> Path:
        """Returns the <system_storage_path>/knowledge_base directory, creating it if needed."""
        root = self.get_system_storage_path() / "knowledge_base"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def get_active_knowledge_base(self, current_dt: Optional[datetime] = None) -> Tuple[str, Path]:
        """Resolves the active monthly knowledge base.
        
        Reuses an existing knowledge base created during the current month (matching kb_DD_MM_YYYY);
        otherwise creates a new one named kb_DD_MM_YYYY using the current system date.
        """
        now = current_dt or datetime.now()
        kb_root = self.get_kb_root_dir()

        # Scan for existing directories created during the current month
        existing_month_kbs: List[Tuple[str, Path, int]] = []

        if kb_root.exists() and kb_root.is_dir():
            for child in kb_root.iterdir():
                if child.is_dir():
                    m = KB_DIR_PATTERN.match(child.name)
                    if m:
                        day = int(m.group(1))
                        month = int(m.group(2))
                        year = int(m.group(3))
                        if month == now.month and year == now.year:
                            existing_month_kbs.append((child.name, child, day))

        if existing_month_kbs:
            # Reuse existing monthly KB (sorted by day ascending or creation)
            existing_month_kbs.sort(key=lambda x: x[2])
            selected_name, selected_path, _ = existing_month_kbs[0]
            logger.info(f"Reusing existing monthly knowledge base: '{selected_name}' at {selected_path}")
            return selected_name, selected_path

        # No knowledge base for the current month -> create a new one named kb_DD_MM_YYYY
        kb_name = now.strftime("kb_%d_%m_%Y")
        kb_dir = kb_root / kb_name
        kb_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created new monthly knowledge base: '{kb_name}' at {kb_dir}")
        return kb_name, kb_dir

    def list_knowledge_bases(self) -> List[Dict[str, Any]]:
        """Lists all existing monthly knowledge base directories."""
        kb_root = self.get_kb_root_dir()
        results: List[Dict[str, Any]] = []

        if not kb_root.exists():
            return results

        for child in kb_root.iterdir():
            if child.is_dir():
                m = KB_DIR_PATTERN.match(child.name)
                if m:
                    results.append({
                        "name": child.name,
                        "path": str(child.resolve()),
                        "day": int(m.group(1)),
                        "month": int(m.group(2)),
                        "year": int(m.group(3)),
                    })

        results.sort(key=lambda x: (x["year"], x["month"], x["day"]), reverse=True)
        return results

kb_storage = KnowledgeBaseStorage()

def get_active_kb_dir(current_dt: Optional[datetime] = None) -> Tuple[str, Path]:
    return kb_storage.get_active_knowledge_base(current_dt=current_dt)
