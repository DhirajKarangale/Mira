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
                workers = int(data.get("screenshot_extraction_workers") or default_config["screenshot_extraction_workers"])
                poll_time = float(data.get("screenshot_extraction_poll_time") or default_config["screenshot_extraction_poll_time"])
                return {
                    "screenshot_extraction_workers": max(1, min(workers, 50)),
                    "screenshot_extraction_poll_time": max(0.5, min(poll_time, 1800.0)),
                }
        except Exception:
            continue

    return default_config
