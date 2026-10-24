from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional
import sys

# Ensure Memory module root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

try:
    import config as memory_config
except ImportError:
    from Memory import config as memory_config

DEFAULT_BATCH_SIZE: int = int(os.getenv("KB_BATCH_SIZE", "10"))
MAX_BATCH_SIZE: int = 10
CONSUMER_KEY_EMBEDDING_MEMORY: str = "embedding_memory"
CONSUMER_GROUP_EMBEDDING_MEMORY: str = "CONSUMER_GROUP_EMBEDDING_MEMORY"
DEFAULT_COLLECTION_NAME: str = "knowledge_base"

def get_vault_base_url() -> Optional[str]:
    return memory_config.VAULT_URL or memory_config.get_service_url("vault")

def get_broker_base_url() -> str:
    mb_url = memory_config.get_service_url("message_broker") or memory_config.MESSAGE_BROKER_URL
    if not mb_url:
        raise RuntimeError("Message Broker URL is not configured")
    return mb_url.rstrip("/")

def get_system_storage_path() -> Path:
    return memory_config.fetch_system_storage_path()

def get_worker_concurrency() -> int:
    cfg = memory_config.fetch_worker_config()
    return int(cfg.get("embedding_vector_store_workers", 1))

def get_worker_poll_time() -> float:
    cfg = memory_config.fetch_worker_config()
    return float(cfg.get("embedding_vector_store_workers_poll_time", 1.0))
