from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Any, Dict

# Ensure Engine module root is in sys.path
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

import config as engine_config

# Configurable constants
DEFAULT_BATCH_SIZE: int = int(os.getenv("EMBEDDING_BATCH_SIZE", "10"))
DEFAULT_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "Qwen/Qwen3-Embedding-0.6B")

# Message broker consumer keys and group names
CONSUMER_KEY_SUMMARY_EMBEDDING: str = "summary_embedding"
CONSUMER_GROUP_SUMMARY_EMBEDDING: str = "CONSUMER_GROUP_SUMMARY_EMBEDDING"

CONSUMER_KEY_EMBEDDING_MEMORY: str = "embedding_memory"
CONSUMER_GROUP_EMBEDDING_MEMORY: str = "CONSUMER_GROUP_EMBEDDING_MEMORY"

def get_broker_base_url() -> str:
    mb_url = engine_config.get_service_url("message_broker") or engine_config.MESSAGE_BROKER_URL
    if not mb_url:
        mb_url = "http://127.0.0.1:9002"
    return mb_url.rstrip("/")

def get_embedding_workers_count() -> int:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    count = workers_cfg.get("embedding_workers", 1)
    try:
        return max(1, min(int(count), 50))
    except (ValueError, TypeError):
        return 1

def get_embedding_poll_time() -> float:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    poll = workers_cfg.get("embedding_poll_time", 5.0)
    try:
        return max(0.5, min(float(poll), 1800.0))
    except (ValueError, TypeError):
        return 5.0

def get_embedding_model_name() -> str:
    return DEFAULT_MODEL_NAME
