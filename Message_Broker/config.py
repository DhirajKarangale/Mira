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
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("services.json was not found in project workspace")


SERVICES: Dict[str, str] = load_services_json()


def get_service_url(module_name: str) -> str:
    key = module_name.lower().replace("-", "_")
    if key not in SERVICES:
        raise KeyError(f"Module '{module_name}' not defined in services.json")
    return SERVICES[key]


VAULT_URL: str = SERVICES["vault"]

REDIS_HOST: str = "localhost"
REDIS_PORT: int = 6379
REDIS_DB: int = 0
REDIS_PASSWORD: Optional[str] = None
REDIS_PROTOCOL: int = 2
REDIS_DECODE_RESPONSES: bool = True

SERVER_HOST: str = "127.0.0.1"
SERVER_RELOAD: bool = False


def apply_config_dict(cfg: Dict[str, Any]) -> None:
    global REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, REDIS_PROTOCOL, REDIS_DECODE_RESPONSES
    global SERVER_HOST, SERVER_RELOAD

    if "REDIS_HOST" in cfg and cfg["REDIS_HOST"] is not None:
        REDIS_HOST = str(cfg["REDIS_HOST"])
    if "REDIS_PORT" in cfg and cfg["REDIS_PORT"] is not None:
        REDIS_PORT = int(cfg["REDIS_PORT"])
    if "REDIS_DB" in cfg and cfg["REDIS_DB"] is not None:
        REDIS_DB = int(cfg["REDIS_DB"])
    if "REDIS_PASSWORD" in cfg:
        REDIS_PASSWORD = cfg["REDIS_PASSWORD"]
    if "REDIS_PROTOCOL" in cfg and cfg["REDIS_PROTOCOL"] is not None:
        REDIS_PROTOCOL = int(cfg["REDIS_PROTOCOL"])
    if "REDIS_DECODE_RESPONSES" in cfg and cfg["REDIS_DECODE_RESPONSES"] is not None:
        REDIS_DECODE_RESPONSES = bool(cfg["REDIS_DECODE_RESPONSES"])
    if "SERVER_HOST" in cfg and cfg["SERVER_HOST"] is not None:
        SERVER_HOST = str(cfg["SERVER_HOST"])
    if "SERVER_RELOAD" in cfg and cfg["SERVER_RELOAD"] is not None:
        SERVER_RELOAD = bool(cfg["SERVER_RELOAD"])


def fetch_config(vault_base_url: Optional[str] = None) -> Dict[str, Any]:
    url = (vault_base_url or VAULT_URL).rstrip("/")
    endpoint = f"{url}/config/message_broker"

    response = requests.get(endpoint, timeout=3.0)
    response.raise_for_status()
    remote_cfg = response.json()
    apply_config_dict(remote_cfg)
    return remote_cfg


fetch_and_store_config = fetch_config
