from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
import requests

CONFIG_FILE_PATH = Path(__file__).resolve().parent / "config.json"
VAULT_URL = os.getenv("VAULT_URL", "http://127.0.0.1:8001")


def load_local_config() -> Dict[str, Any]:
    """
    Loads configuration values from the local config.json file.
    """
    if CONFIG_FILE_PATH.exists():
        try:
            return json.loads(CONFIG_FILE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "REDIS_HOST": "localhost",
        "REDIS_PORT": 6379,
        "REDIS_DB": 0,
        "REDIS_PASSWORD": None,
        "REDIS_PROTOCOL": 2,
        "REDIS_DECODE_RESPONSES": True,
        "SERVER_HOST": "127.0.0.1",
        "SERVER_PORT": 8000,
        "SERVER_RELOAD": False
    }


# Initial load from local configuration file
_local = load_local_config()
REDIS_HOST: str = _local.get("REDIS_HOST", "localhost")
REDIS_PORT: int = int(_local.get("REDIS_PORT", 6379))
REDIS_DB: int = int(_local.get("REDIS_DB", 0))
REDIS_PASSWORD: Optional[str] = _local.get("REDIS_PASSWORD", None)
REDIS_PROTOCOL: int = int(_local.get("REDIS_PROTOCOL", 2))
REDIS_DECODE_RESPONSES: bool = bool(_local.get("REDIS_DECODE_RESPONSES", True))

SERVER_HOST: str = _local.get("SERVER_HOST", "127.0.0.1")
SERVER_PORT: int = int(_local.get("SERVER_PORT", 8000))
SERVER_RELOAD: bool = bool(_local.get("SERVER_RELOAD", False))


def apply_config_dict(cfg: Dict[str, Any]) -> None:
    """
    Updates the active in-memory module attributes from a configuration dictionary.
    """
    global REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, REDIS_PROTOCOL, REDIS_DECODE_RESPONSES
    global SERVER_HOST, SERVER_PORT, SERVER_RELOAD

    if "REDIS_HOST" in cfg:
        REDIS_HOST = str(cfg["REDIS_HOST"])
    if "REDIS_PORT" in cfg:
        REDIS_PORT = int(cfg["REDIS_PORT"])
    if "REDIS_DB" in cfg:
        REDIS_DB = int(cfg["REDIS_DB"])
    if "REDIS_PASSWORD" in cfg:
        REDIS_PASSWORD = cfg["REDIS_PASSWORD"]
    if "REDIS_PROTOCOL" in cfg:
        REDIS_PROTOCOL = int(cfg["REDIS_PROTOCOL"])
    if "REDIS_DECODE_RESPONSES" in cfg:
        REDIS_DECODE_RESPONSES = bool(cfg["REDIS_DECODE_RESPONSES"])
    if "SERVER_HOST" in cfg:
        SERVER_HOST = str(cfg["SERVER_HOST"])
    if "SERVER_PORT" in cfg:
        SERVER_PORT = int(cfg["SERVER_PORT"])
    if "SERVER_RELOAD" in cfg:
        SERVER_RELOAD = bool(cfg["SERVER_RELOAD"])


def fetch_and_store_config(vault_base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetches the Message Broker configuration from Vault GET API (/config/message_broker),
    stores it locally in config.json, and updates module configuration values.
    """
    url = (vault_base_url or VAULT_URL).rstrip("/")
    endpoint = f"{url}/config/message_broker"

    try:
        response = requests.get(endpoint, timeout=2.0)
        if response.status_code == 200:
            remote_cfg = response.json()
            CONFIG_FILE_PATH.write_text(json.dumps(remote_cfg, indent=2), encoding="utf-8")
            apply_config_dict(remote_cfg)
            return remote_cfg
    except Exception as e:
        # Graceful fallback: maintain existing locally stored configuration
        pass

    local_cfg = load_local_config()
    apply_config_dict(local_cfg)
    return local_cfg
