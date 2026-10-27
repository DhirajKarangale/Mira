from __future__ import annotations

import os
from pathlib import Path
import sys

_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

import config as engine_config

CONSUMER_KEY_LLM_CHAT: str = "llm_chat"
CONSUMER_GROUP_LLM_CHAT: str = "CONSUMER_GROUP_LLM_CHAT"

# Maximum number of chat turns stored in short-term Redis memory per session
MAX_SHORT_TERM_MEMORY: int = 50

DEFAULT_CHAT_WORKERS: int = 1
DEFAULT_POLL_TIME: float = 1.0


def get_broker_base_url() -> str:
    mb_url = engine_config.get_service_url("message_broker") or engine_config.MESSAGE_BROKER_URL
    if not mb_url:
        mb_url = "http://127.0.0.1:9002"
    return mb_url.rstrip("/")


def get_vault_base_url() -> str:
    vault_url = engine_config.get_service_url("vault") or engine_config.VAULT_URL
    if not vault_url:
        vault_url = "http://127.0.0.1:9001"
    return vault_url.rstrip("/")


def get_chat_workers_count() -> int:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    count = workers_cfg.get("chat_workers", DEFAULT_CHAT_WORKERS)
    try:
        return max(1, min(int(count), 20))
    except (ValueError, TypeError):
        return DEFAULT_CHAT_WORKERS


def get_chat_poll_time() -> float:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    poll = workers_cfg.get("chat_workers_poll_time", DEFAULT_POLL_TIME)
    try:
        return max(0.1, min(float(poll), 60.0))
    except (ValueError, TypeError):
        return DEFAULT_POLL_TIME
