from __future__ import annotations

import re
import sys
import time
from typing import Optional
import requests

MODULE_NAME = "engine"
_last_vault_failure: float = 0.0
_VAULT_RETRY_INTERVAL: float = 5.0

# Regex patterns to sanitize API keys from any log output
_KEY_PATTERNS = [
    re.compile(r"gsk_[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"AQ\.[a-zA-Z0-9_\-]{20,}", re.IGNORECASE),
    re.compile(r"AIza[a-zA-Z0-9_\-]{20,}", re.IGNORECASE),
    re.compile(r"sk-[a-zA-Z0-9_\-]{20,}", re.IGNORECASE),
]

def mask_sensitive(text: str) -> str:
    """Masks API keys and secrets so they are never printed or logged."""
    if not isinstance(text, str):
        text = str(text)
    sanitized = text
    for pattern in _KEY_PATTERNS:
        sanitized = pattern.sub("[REDACTED_API_KEY]", sanitized)
    return sanitized

def log(message: str) -> None:
    """Delivers log message to Vault's centralized logging endpoint."""
    global _last_vault_failure
    raw_message = str(message)
    clean_message = mask_sensitive(raw_message)
    now = time.time()

    from config import get_service_url
    vault_url = get_service_url("vault")
    if not vault_url or (now - _last_vault_failure < _VAULT_RETRY_INTERVAL):
        print(f"[{MODULE_NAME}] {clean_message}", file=sys.stderr, flush=True)
        return

    endpoint = f"{vault_url.rstrip('/')}/logs"
    payload = {
        "module_name": MODULE_NAME,
        "data": clean_message,
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=0.5)
        response.raise_for_status()
    except Exception as e:
        _last_vault_failure = time.time()
        print(
            f"[{MODULE_NAME}] (Vault logging delivery fallback: {e}) {clean_message}",
            file=sys.stderr,
            flush=True
        )

def log_error(message: str) -> None:
    log(f"ERROR: {message}")
