from __future__ import annotations

import sys
import requests

import config

MODULE_NAME = "message_broker"


def log(message: str) -> None:
    log_string = str(message)
    vault_url = config.get_service_url("vault")
    if not vault_url:
        print(f"[{MODULE_NAME}] {log_string}", file=sys.stderr, flush=True)
        return

    endpoint = f"{vault_url.rstrip('/')}/logs"

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
