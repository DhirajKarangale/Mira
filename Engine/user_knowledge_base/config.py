from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Union

# Ensure Engine root is importable
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

try:
    import config as engine_config
except ImportError:
    from Engine import config as engine_config

CONSUMER_KEY_USER_KB: str = "user_knowledge_base"
CONSUMER_GROUP_USER_KB: str = "CONSUMER_GROUP_USER_KNOWLEDGE_BASE"
DEFAULT_BATCH_SIZE: int = 10
MAX_BATCH_SIZE: int = 10


def get_broker_base_url() -> str:
    mb_url = engine_config.MESSAGE_BROKER_URL or engine_config.get_service_url("message_broker")
    if not mb_url:
        return "http://127.0.0.1:9002"
    return mb_url.rstrip("/")


def get_vault_base_url() -> Optional[str]:
    vault_url = engine_config.VAULT_URL or engine_config.get_service_url("vault")
    return vault_url.rstrip("/") if vault_url else "http://127.0.0.1:9001"


def get_system_dir() -> Path:
    sys_dir = getattr(engine_config, "SYSTEM_DIR", None)
    if sys_dir and isinstance(sys_dir, Path):
        sys_dir.mkdir(parents=True, exist_ok=True)
        return sys_dir
    default_dir = Path(__file__).resolve().parent.parent.parent / "Vault" / "system"
    default_dir.mkdir(parents=True, exist_ok=True)
    return default_dir


def get_kb_enc_path() -> Path:
    return get_system_dir() / "user_knowledge_base.enc"


def get_kb_db_path() -> Path:
    return get_kb_enc_path()


def cleanup_legacy_plaintext_files() -> None:
    """
    Ensure no plaintext databases or JSON files remain unencrypted on disk.
    """
    sys_dir = get_system_dir()
    for legacy_name in ("user_knowledge_base.db", "user_knowledge_base.db-wal", "user_knowledge_base.db-shm", "user_knowledge_base.json"):
        legacy_file = sys_dir / legacy_name
        if legacy_file.exists():
            try:
                legacy_file.unlink(missing_ok=True)
            except Exception:
                pass


def get_kb_workers_count() -> int:
    return engine_config.CONFIG.get_user_knowledge_base_workers_count()


def get_kb_workers_poll_time() -> float:
    return engine_config.CONFIG.get_user_knowledge_base_workers_poll_time()


def to_unix_timestamp(ts: Any) -> int:
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
