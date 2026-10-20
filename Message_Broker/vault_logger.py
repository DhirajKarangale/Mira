from __future__ import annotations

import sys
import requests

import config

MODULE_NAME = "message_broker"


def log(message: str) -> None:
    log_string = str(message)
    vault_url = getattr(config, "VAULT_URL", "http://127.0.0.1:8001").rstrip("/")
    endpoint = f"{vault_url}/logs"

    payload = {
        "module_name": MODULE_NAME,
        "data": log_string,
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=2.0)
        response.raise_for_status()
    except Exception as e:
        print(
            f"[{MODULE_NAME}] (Vault logging delivery fallback: {e}) {log_string}",
            file=sys.stderr,
            flush=True
        )


send_log = log
