from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional
CONFIG_FILE_PATH = Path(__file__).resolve().parent / 'consumer_groups.json'
_CONSUMER_GROUPS_CACHE: Dict[str, str] = {}
_CONFIG_MTIME: float = 0.0

def _load_consumer_groups() -> Dict[str, str]:
    global _CONSUMER_GROUPS_CACHE, _CONFIG_MTIME
    if not CONFIG_FILE_PATH.exists():
        raise FileNotFoundError(f'Consumer groups configuration file not found: {CONFIG_FILE_PATH}')
    current_mtime = CONFIG_FILE_PATH.stat().st_mtime
    if not _CONSUMER_GROUPS_CACHE or current_mtime != _CONFIG_MTIME:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            _CONSUMER_GROUPS_CACHE = json.load(f)
        _CONFIG_MTIME = current_mtime
    return _CONSUMER_GROUPS_CACHE

def get_consumer_group(consumer_key: str) -> Optional[str]:
    groups = _load_consumer_groups()
    if consumer_key in groups:
        return groups[consumer_key]
    if consumer_key in groups.values():
        return consumer_key
    if consumer_key.upper() in ('CONSUMER_GROUP_LLM_CHAT', 'LLM_CHAT') and 'llm_chat' in groups:
        return groups['llm_chat']
    if consumer_key.upper() in ('CONSUMER_GROUP_USER_KNOWLEDGE_BASE', 'USER_KNOWLEDGE_BASE') and 'user_knowledge_base' in groups:
        return groups['user_knowledge_base']
    return None

def get_all_consumer_groups() -> List[str]:
    groups = _load_consumer_groups()
    return list(groups.values())

def get_stream_for_consumer_key(consumer_key: str) -> Optional[str]:
    groups = _load_consumer_groups()
    if consumer_key in groups:
        return f'mira:stream:{consumer_key}'
    for k, v in groups.items():
        if v == consumer_key:
            return f'mira:stream:{k}'
    if consumer_key.upper() in ('CONSUMER_GROUP_LLM_CHAT', 'LLM_CHAT') and 'llm_chat' in groups:
        return 'mira:stream:llm_chat'
    if consumer_key.upper() in ('CONSUMER_GROUP_USER_KNOWLEDGE_BASE', 'USER_KNOWLEDGE_BASE') and 'user_knowledge_base' in groups:
        return 'mira:stream:user_knowledge_base'
    return None

def get_stream_for_consumer_group(consumer_group: str) -> Optional[str]:
    mappings = _load_consumer_groups()
    for key, group in mappings.items():
        if group == consumer_group or key == consumer_group:
            return f'mira:stream:{key}'
    if consumer_group.upper() in ('CONSUMER_GROUP_LLM_CHAT', 'LLM_CHAT') and 'llm_chat' in mappings:
        return 'mira:stream:llm_chat'
    if consumer_group.upper() in ('CONSUMER_GROUP_USER_KNOWLEDGE_BASE', 'USER_KNOWLEDGE_BASE') and 'user_knowledge_base' in mappings:
        return 'mira:stream:user_knowledge_base'
    return None
