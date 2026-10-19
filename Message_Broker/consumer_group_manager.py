from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

CONFIG_FILE_PATH = Path(__file__).resolve().parent / "consumer_groups.json"

_CONSUMER_GROUPS_CACHE: Dict[str, str] = {}


def _load_consumer_groups() -> Dict[str, str]:
    global _CONSUMER_GROUPS_CACHE
    if not _CONSUMER_GROUPS_CACHE:
        if not CONFIG_FILE_PATH.exists():
            raise FileNotFoundError(f"Consumer groups configuration file not found: {CONFIG_FILE_PATH}")
        with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
            _CONSUMER_GROUPS_CACHE = json.load(f)
    return _CONSUMER_GROUPS_CACHE


def get_consumer_group(consumer_key: str) -> Optional[str]:
    groups = _load_consumer_groups()
    return groups.get(consumer_key)


def get_all_consumer_groups() -> List[str]:
    groups = _load_consumer_groups()
    return list(groups.values())


def get_all_consumer_mappings() -> Dict[str, str]:
    return dict(_load_consumer_groups())


def get_stream_for_consumer_key(consumer_key: str) -> Optional[str]:
    if consumer_key not in _load_consumer_groups():
        return None
    return f"mira:stream:{consumer_key}"


def get_stream_for_consumer_group(consumer_group: str) -> Optional[str]:
    mappings = _load_consumer_groups()
    for key, group in mappings.items():
        if group == consumer_group:
            return f"mira:stream:{key}"
    return None
