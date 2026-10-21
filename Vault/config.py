from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Optional


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


def set_services(services_map: Dict[str, str]) -> None:
    global SERVICES
    SERVICES.update({k.lower().replace("-", "_"): v.rstrip("/") for k, v in services_map.items()})


def get_services() -> Dict[str, str]:
    return dict(SERVICES)


def get_service_url(module_name: str, default: Optional[str] = None) -> Optional[str]:
    key = module_name.lower().replace("-", "_")
    if key in SERVICES:
        return SERVICES[key]
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


_vault_url = os.getenv("VAULT_URL", SERVICES.get("vault", ""))
if _vault_url:
    _clean_url = _vault_url.replace("http://", "").replace("https://", "").rstrip("/")
    if ":" in _clean_url:
        _host, _port_str = _clean_url.split(":")
    else:
        _host, _port_str = "127.0.0.1", "1000"
else:
    _host, _port_str = "127.0.0.1", "1000"

SERVER_HOST: str = os.getenv("VAULT_HOST", _host)
SERVER_PORT: int = int(os.getenv("VAULT_PORT", _port_str))
SERVER_RELOAD: bool = os.getenv("VAULT_RELOAD", "false").lower() in ("true", "1", "yes")

VAULT_DIR: Path = Path(__file__).resolve().parent
SYSTEM_DIR: Path = Path(os.getenv("MIRA_SYSTEM_DIR", str(VAULT_DIR / "system")))
LOGS_DIR: Path = Path(os.getenv("MIRA_LOGS_DIR", str(SYSTEM_DIR / "logs")))

SCHEMA_FILE_PATH: Path = Path(os.getenv("MIRA_SCHEMA_FILE", str(VAULT_DIR / "schema.sql")))

KEYRING_SERVICE_NAME: str = os.getenv("MIRA_KEYRING_SERVICE", "MIRA_VAULT")
KEYRING_KEY_NAME: str = os.getenv("MIRA_KEYRING_KEY_NAME", "master_encryption_key")
KEY_PREFIX: str = os.getenv("MIRA_KEY_PREFIX", "MIRA_VAULT_PREFIX_SEC_")
KEY_SUFFIX: str = os.getenv("MIRA_KEY_SUFFIX", "_MIRA_VAULT_SUFFIX_KEY")

LOG_FILENAME_FORMAT: str = "%d-%m-%Y.jsonl"
LOG_TIMESTAMP_FORMAT: str = "%d/%m/%YT%H:%M:%S"
