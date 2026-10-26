from __future__ import annotations

import os
from typing import Optional
from config import VAULT_URL, get_service_url

DEFAULT_WEATHER_INTERVAL_HOURS: float = float(os.getenv("WEATHER_REFRESH_INTERVAL_HOURS", "12.0"))
DEFAULT_NEWS_INTERVAL_HOURS: float = float(os.getenv("NEWS_REFRESH_INTERVAL_HOURS", "3.0"))
DEFAULT_SUGGESTIONS_INTERVAL_HOURS: float = float(os.getenv("SUGGESTIONS_REFRESH_INTERVAL_HOURS", "24.0"))


def get_vault_base_url() -> str:
    url = VAULT_URL or get_service_url("vault", "http://127.0.0.1:9001")
    return url.rstrip("/")
