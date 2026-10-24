from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
import requests

def load_services_json() -> Dict[str, str]:
    candidate_paths = [
        Path(os.getenv("SERVICES_JSON_PATH", "")),
        Path(__file__).resolve().parent.parent / "services.json",
        Path.cwd() / "services.json",
    ]
    for p in candidate_paths:
        if p and p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return {}

SERVICES: Dict[str, str] = load_services_json()

def get_service_url(module_name: str, default: Optional[str] = None) -> Optional[str]:
    key = module_name.lower().replace("-", "_")
    if key in SERVICES:
        return SERVICES[key].rstrip("/")
    env_key = f"{key.upper()}_URL"
    if env_key in os.environ:
        return os.environ[env_key].rstrip("/")
    try:
        fresh_services = load_services_json()
        if key in fresh_services:
            SERVICES[key] = fresh_services[key].rstrip("/")
            return SERVICES[key]
    except Exception:
        pass
    if default is not None:
        return default
    return None

VAULT_URL: Optional[str] = os.getenv("VAULT_URL", get_service_url("vault"))
MESSAGE_BROKER_URL: Optional[str] = os.getenv("MESSAGE_BROKER_URL", get_service_url("message_broker"))
OPERATOR_URL: Optional[str] = os.getenv("OPERATOR_URL", get_service_url("operator"))

_memory_url = os.getenv("MEMORY_URL", SERVICES.get("memory", ""))
_parsed_memory_host: Optional[str] = None
_parsed_memory_port: Optional[int] = None

if _memory_url:
    _clean_mem = _memory_url.replace("http://", "").replace("https://", "").rstrip("/")
    if ":" in _clean_mem:
        _parts = _clean_mem.split(":")
        _parsed_memory_host = _parts[0]
        _parsed_memory_port = int(_parts[1]) if _parts[1].isdigit() else None
    else:
        _parsed_memory_host = _clean_mem

_env_host = os.getenv("HOST")
_env_port = os.getenv("PORT")

SERVER_HOST: str = _env_host or _parsed_memory_host or "127.0.0.1"
SERVER_PORT: int = int(_env_port) if _env_port and _env_port.isdigit() else (_parsed_memory_port or 9006)

def fetch_worker_config(vault_base_url: Optional[str] = None) -> Dict[str, Any]:
    vault_url = vault_base_url or VAULT_URL or get_service_url("vault")
    default_config = {
        "screenshot_extraction_workers": 1,
        "screenshot_extraction_poll_time": 5.0,
        "embedding_vector_store_workers": 1,
        "embedding_vector_store_workers_poll_time": 1.0,
    }
    if not vault_url:
        return default_config

    endpoints = [
        f"{vault_url.rstrip('/')}/engine/workers",
        f"{vault_url.rstrip('/')}/config/engine_workers",
    ]

    for ep in endpoints:
        try:
            resp = requests.get(ep, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                sc_workers = int(data.get("screenshot_extraction_workers") or default_config["screenshot_extraction_workers"])
                sc_poll_time = float(data.get("screenshot_extraction_poll_time") or default_config["screenshot_extraction_poll_time"])
                kb_workers = int(data.get("embedding_vector_store_workers") or default_config["embedding_vector_store_workers"])
                kb_poll_time = float(
                    data.get("embedding_vector_store_workers_poll_time")
                    if data.get("embedding_vector_store_workers_poll_time") is not None
                    else default_config["embedding_vector_store_workers_poll_time"]
                )
                return {
                    "screenshot_extraction_workers": max(1, min(sc_workers, 50)),
                    "screenshot_extraction_poll_time": max(0.5, min(sc_poll_time, 1800.0)),
                    "embedding_vector_store_workers": max(1, min(kb_workers, 50)),
                    "embedding_vector_store_workers_poll_time": max(0.1, min(kb_poll_time, 1800.0)),
                }
        except Exception:
            continue

    return default_config

def fetch_system_storage_path(vault_base_url: Optional[str] = None) -> Path:
    """Retrieves the configured system storage path from Vault or local fallback."""
    vault_url = vault_base_url or VAULT_URL or get_service_url("vault")
    default_system_path = Path(
        os.getenv(
            "MIRA_SYSTEM_DIR",
            str(Path(__file__).resolve().parent.parent / "Vault" / "system")
        )
    )

    if not vault_url:
        return default_system_path

    endpoints = [
        f"{vault_url.rstrip('/')}/system/storage",
        f"{vault_url.rstrip('/')}/config/system",
        f"{vault_url.rstrip('/')}/config/system_storage",
    ]

    for ep in endpoints:
        try:
            resp = requests.get(ep, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                sys_path = data.get("system_storage_path")
                if sys_path:
                    return Path(sys_path)
        except Exception:
            continue

    return default_system_path

DEFAULT_KB_BATCH_SIZE: int = int(os.getenv("KB_BATCH_SIZE", "10"))
CONSUMER_KEY_EMBEDDING_MEMORY: str = "embedding_memory"
CONSUMER_GROUP_EMBEDDING_MEMORY: str = "CONSUMER_GROUP_EMBEDDING_MEMORY"

_initial_worker_cfg = fetch_worker_config()
SCREENSHOT_EXTRACTION_WORKERS: int = _initial_worker_cfg.get("screenshot_extraction_workers", 1)
SCREENSHOT_EXTRACTION_POLL_TIME: float = _initial_worker_cfg.get("screenshot_extraction_poll_time", 5.0)
EMBEDDING_VECTOR_STORE_WORKERS: int = _initial_worker_cfg.get("embedding_vector_store_workers", 1)
EMBEDDING_VECTOR_STORE_WORKERS_POLL_TIME: float = _initial_worker_cfg.get("embedding_vector_store_workers_poll_time", 1.0)

SYSTEM_STORAGE_PATH: Path = fetch_system_storage_path()
KNOWLEDGE_BASE_DIR: Path = SYSTEM_STORAGE_PATH / "knowledge_base"

def fetch_operator_config(vault_base_url: Optional[str] = None) -> Dict[str, Any]:
    """Fetches operator configurations including Knowledge Base retention policy from Vault."""
    vault_url = vault_base_url or VAULT_URL or get_service_url("vault")
    default_config = {
        "CAPTURE_INTERVAL_SECS": 10,
        "AUTO_START": False,
        "KNOWLEDGE_BASE_RETENTION_PERIOD": "Never auto delete",
    }
    if not vault_url:
        return default_config

    try:
        resp = requests.get(f"{vault_url.rstrip('/')}/config/operator", timeout=3.0)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "CAPTURE_INTERVAL_SECS": int(data.get("CAPTURE_INTERVAL_SECS") or 10),
                "AUTO_START": bool(data.get("AUTO_START")),
                "KNOWLEDGE_BASE_RETENTION_PERIOD": str(
                    data.get("KNOWLEDGE_BASE_RETENTION_PERIOD") or "Never auto delete"
                ).strip(),
            }
    except Exception:
        pass
    return default_config


