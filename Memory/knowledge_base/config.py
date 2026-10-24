from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Union

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

try:
    import config as memory_config
except ImportError:
    from Memory import config as memory_config

DEFAULT_KB_BATCH_SIZE: int = int(os.getenv("KB_BATCH_SIZE", str(getattr(memory_config, "DEFAULT_KB_BATCH_SIZE", 10))))
MAX_KB_BATCH_SIZE: int = 10
CONSUMER_KEY_EMBEDDING_MEMORY: str = getattr(memory_config, "CONSUMER_KEY_EMBEDDING_MEMORY", "embedding_memory")
CONSUMER_GROUP_EMBEDDING_MEMORY: str = getattr(memory_config, "CONSUMER_GROUP_EMBEDDING_MEMORY", "CONSUMER_GROUP_EMBEDDING_MEMORY")
COLLECTION_NAME: str = "knowledge_base"

def get_broker_base_url() -> str:
    """Returns the base URL for the Message Broker service."""
    mb_url = memory_config.get_service_url("message_broker") or memory_config.MESSAGE_BROKER_URL
    if not mb_url:
        return "http://127.0.0.1:9002"
    return mb_url.rstrip("/")

def get_vault_base_url() -> Optional[str]:
    """Returns the base URL for Vault service."""
    vault_url = memory_config.get_service_url("vault") or memory_config.VAULT_URL
    return vault_url.rstrip("/") if vault_url else "http://127.0.0.1:9001"

def get_system_storage_path() -> Path:
    """Returns the system storage path configured in Vault or local fallback."""
    return memory_config.fetch_system_storage_path(get_vault_base_url())

def get_knowledge_base_dir() -> Path:
    """Returns the directory path for storing Qdrant Knowledge Bases directly under vault/system/knowledge_base/."""
    sys_path = get_system_storage_path()
    kb_dir = sys_path / "knowledge_base"
    kb_dir.mkdir(parents=True, exist_ok=True)
    return kb_dir

def get_worker_config() -> Dict[str, Any]:
    """Fetches embedding vector store worker configurations from Vault."""
    return memory_config.fetch_worker_config(get_vault_base_url())

def to_unix_timestamp(ts: Any) -> int:
    """Converts any timestamp input exclusively to an integer Unix timestamp."""
    if ts is None:
        return int(datetime.now(timezone.utc).timestamp())
    if isinstance(ts, (int, float)):
        return int(ts)
    if isinstance(ts, str):
        s = ts.strip()
        try:
            val = float(s)
            return int(val)
        except ValueError:
            pass
        for fmt in (
            "%d/%m/%YT%H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d-%m-%YT%H-%M-%S",
            "%d-%m-%Y %H:%M:%S",
            "%d_%m_%Y",
            "%Y-%m-%d",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                return int(dt.replace(tzinfo=timezone.utc).timestamp())
            except ValueError:
                pass
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except Exception:
            pass
    return int(datetime.now(timezone.utc).timestamp())
