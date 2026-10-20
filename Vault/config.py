from __future__ import annotations

import os
from pathlib import Path

# Server configuration
SERVER_HOST: str = os.getenv("VAULT_HOST", "127.0.0.1")
SERVER_PORT: int = int(os.getenv("VAULT_PORT", "8001"))
SERVER_RELOAD: bool = os.getenv("VAULT_RELOAD", "false").lower() in ("true", "1", "yes")

# Base and System directories
VAULT_DIR: Path = Path(__file__).resolve().parent
PROJECT_ROOT: Path = VAULT_DIR.parent
SYSTEM_DIR: Path = Path(os.getenv("MIRA_SYSTEM_DIR", str(VAULT_DIR / "system")))
LOGS_DIR: Path = Path(os.getenv("MIRA_LOGS_DIR", str(SYSTEM_DIR / "logs")))

# SQL Schema
SCHEMA_FILE_PATH: Path = Path(os.getenv("MIRA_SCHEMA_FILE", str(VAULT_DIR / "schema.sql")))

# Keyring & Cryptography
KEYRING_SERVICE_NAME: str = os.getenv("MIRA_KEYRING_SERVICE", "MIRA_VAULT")
KEYRING_KEY_NAME: str = os.getenv("MIRA_KEYRING_KEY_NAME", "master_encryption_key")
KEY_PREFIX: str = os.getenv("MIRA_KEY_PREFIX", "MIRA_VAULT_PREFIX_SEC_")
KEY_SUFFIX: str = os.getenv("MIRA_KEY_SUFFIX", "_MIRA_VAULT_SUFFIX_KEY")

# Log Management File Formats
LOG_FILENAME_FORMAT: str = "%d-%m-%Y.jsonl"
LOG_TIMESTAMP_FORMAT: str = "%d/%m/%YT%H:%M:%S"
