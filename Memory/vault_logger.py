from __future__ import annotations

import sys
import requests

import config

import time

MODULE_NAME = "memory"
_last_vault_failure: float = 0.0
_VAULT_RETRY_INTERVAL: float = 5.0

def log(message: str) -> None:
    global _last_vault_failure
    log_string = str(message)
    now = time.time()

    vault_url = config.get_service_url("vault")
    if not vault_url or (now - _last_vault_failure < _VAULT_RETRY_INTERVAL):
        print(f"[{MODULE_NAME}] {log_string}", file=sys.stderr, flush=True)
        return

    endpoint = f"{vault_url.rstrip('/')}/logs"

    payload = {
        "module_name": MODULE_NAME,
        "data": log_string,
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=0.5)
        response.raise_for_status()
    except Exception as e:
        _last_vault_failure = time.time()
        print(
            f"[{MODULE_NAME}] (Vault logging delivery fallback: {e}) {log_string}",
            file=sys.stderr,
            flush=True
        )

def log_error(message: str) -> None:
    log(f"ERROR: {message}")

