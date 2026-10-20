from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict


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


_VAULT_URL = SERVICES["vault"]
_clean_url = _VAULT_URL.replace("http://", "").replace("https://", "").rstrip("/")
_host, _port_str = _clean_url.split(":")

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
