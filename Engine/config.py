from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional
import requests

logger = logging.getLogger("mira.engine.config")

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

def get_service_url(module_name: str, default: Optional[str] = None) -> Optional[str]:
    key = module_name.lower().replace("-", "_")
    if key in SERVICES:
        return SERVICES[key].rstrip("/")
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

VAULT_URL: Optional[str] = os.getenv("VAULT_URL", get_service_url("vault", "http://127.0.0.1:9001"))
MESSAGE_BROKER_URL: Optional[str] = os.getenv("MESSAGE_BROKER_URL", get_service_url("message_broker", "http://127.0.0.1:9002"))

_engine_url = os.getenv("ENGINE_URL", SERVICES.get("engine", ""))
_parsed_engine_host: Optional[str] = None
_parsed_engine_port: Optional[int] = None

if _engine_url:
    _clean_eng = _engine_url.replace("http://", "").replace("https://", "").rstrip("/")
    if ":" in _clean_eng:
        _parts = _clean_eng.split(":")
        _parsed_engine_host = _parts[0]
        _parsed_engine_port = int(_parts[1]) if _parts[1].isdigit() else None
    else:
        _parsed_engine_host = _clean_eng

_env_host = os.getenv("HOST")
_env_port = os.getenv("PORT")

SERVER_HOST: str = _env_host or _parsed_engine_host or "127.0.0.1"
SERVER_PORT: int = int(_env_port) if _env_port and _env_port.isdigit() else (_parsed_engine_port or 9007)

class EngineMemoryConfig:
    """Thread-safe in-memory store for all Engine configurations loaded from Vault."""

    def __init__(self):
        self._lock = threading.RLock()
        self.workers: Dict[str, Any] = {
            "llm_workers": 1,
            "screenshot_extraction_workers": 1,
            "screenshot_summarization_workers": 1,
            "screenshot_extraction_poll_time": 5.0,
            "screenshot_summarization_poll_time": 5.0,
        }
        self.ai_priorities: List[str] = ["gemini", "groq"]
        self.ai_configs: Dict[str, Dict[str, Any]] = {}
        self.active_provider: Optional[str] = "gemini"
        self._initialized: bool = False

    def fetch_from_vault(self, vault_base_url: Optional[str] = None) -> bool:
        """Fetches worker concurrency, AI priorities, and provider keys from Vault."""
        vault_url = vault_base_url or VAULT_URL or get_service_url("vault")
        if not vault_url:
            logger.warning("No Vault URL configured, using existing in-memory defaults.")
            return False

        base = vault_url.rstrip("/")
        success = True

        # 1. Fetch Engine Workers Configuration
        try:
            resp = requests.get(f"{base}/engine/workers", timeout=1.5)
            if resp.status_code == 200:
                data = resp.json()
                with self._lock:
                    self.workers.update(data)
            else:
                logger.warning(f"Failed to fetch /engine/workers from Vault: status {resp.status_code}")
                success = False
        except Exception as e:
            logger.warning(f"Error fetching engine workers from Vault: {e}")
            success = False

        # 2. Fetch AI Priorities
        fetched_priorities: List[str] = []
        try:
            resp = requests.get(f"{base}/ai/priorities", timeout=1.5)
            if resp.status_code == 200:
                raw_priorities = resp.json()
                if isinstance(raw_priorities, list):
                    fetched_priorities = [str(p).strip().lower() for p in raw_priorities if str(p).strip()]
        except Exception as e:
            logger.warning(f"Error fetching AI priorities from Vault: {e}")
            success = False

        # 3. Fetch AI Configurations (keys, active key)
        fetched_configs: Dict[str, Dict[str, Any]] = {}
        try:
            resp = requests.get(f"{base}/ai/configs", timeout=1.5)
            if resp.status_code == 200:
                configs_list = resp.json()
                if isinstance(configs_list, list):
                    for item in configs_list:
                        prov_name = str(item.get("llm_provider", "")).strip().lower()
                        if not prov_name:
                            continue
                        keys = [str(k).strip() for k in item.get("keys", []) if str(k).strip()]
                        current_key = int(item.get("current_key", 0))
                        total_keys = int(item.get("total_keys", len(keys)))
                        fetched_configs[prov_name] = {
                            "provider": prov_name,
                            "display_name": item.get("llm_provider", prov_name),
                            "keys": keys,
                            "current_key": current_key,
                            "total_keys": total_keys,
                        }
        except Exception as e:
            logger.warning(f"Error fetching AI configs from Vault HTTP: {e}")
            success = False

        with self._lock:
            if fetched_priorities:
                self.ai_priorities = fetched_priorities
            if fetched_configs:
                self.ai_configs = fetched_configs

            # Initialize active provider as the first provider in priority sequence
            if self.ai_priorities:
                self.active_provider = self.ai_priorities[0]
            elif self.ai_configs:
                self.active_provider = next(iter(self.ai_configs.keys()))

            if success:
                self._initialized = True

        from vault_logger import log as v_log
        v_log(f"Engine configuration initialized from Vault. Priorities: {self.ai_priorities}, Active: {self.active_provider}")
        return success

    def get_ai_priorities(self) -> List[str]:
        with self._lock:
            return list(self.ai_priorities)

    def get_active_provider(self) -> Optional[str]:
        with self._lock:
            return self.active_provider

    def set_active_provider(self, provider: str) -> None:
        clean = provider.strip().lower()
        with self._lock:
            self.active_provider = clean

    def get_provider_config(self, provider: str) -> Dict[str, Any]:
        clean = provider.strip().lower()
        with self._lock:
            cfg = self.ai_configs.get(clean)
            if cfg:
                return {
                    "provider": cfg["provider"],
                    "display_name": cfg.get("display_name", cfg["provider"]),
                    "keys": list(cfg.get("keys", [])),
                    "current_key": cfg.get("current_key", 0),
                    "total_keys": cfg.get("total_keys", len(cfg.get("keys", []))),
                }
            return {
                "provider": clean,
                "display_name": clean,
                "keys": [],
                "current_key": 0,
                "total_keys": 0,
            }

    def get_active_key(self, provider: str) -> Optional[str]:
        cfg = self.get_provider_config(provider)
        keys = cfg.get("keys", [])
        if not keys:
            return None
        idx = cfg.get("current_key", 0)
        if 0 <= idx < len(keys):
            return keys[idx]
        return keys[0]

    def rotate_key(self, provider: str) -> Optional[str]:
        """Rotates the provider's active key to the next available key and syncs with Vault."""
        clean = provider.strip().lower()
        new_index = 0
        new_key: Optional[str] = None
        with self._lock:
            cfg = self.ai_configs.get(clean)
            if not cfg or not cfg.get("keys"):
                return None
            keys = cfg["keys"]
            current = cfg.get("current_key", 0)
            new_index = (current + 1) % len(keys)
            cfg["current_key"] = new_index
            new_key = keys[new_index]

        # Best-effort sync back to Vault
        self._sync_key_to_vault(clean, new_index)
        return new_key

    def set_active_key_index(self, provider: str, index: int) -> None:
        clean = provider.strip().lower()
        with self._lock:
            cfg = self.ai_configs.get(clean)
            if cfg and cfg.get("keys"):
                keys = cfg["keys"]
                valid_idx = max(0, min(index, len(keys) - 1))
                cfg["current_key"] = valid_idx
                self._sync_key_to_vault(clean, valid_idx)

    def _sync_key_to_vault(self, provider: str, current_key_index: int) -> None:
        vault_url = VAULT_URL or get_service_url("vault")
        if not vault_url:
            return
        def _post():
            try:
                requests.post(
                    f"{vault_url.rstrip('/')}/ai/configs/{provider}",
                    json={"current_key": current_key_index},
                    timeout=1.0
                )
            except Exception:
                pass
        t = threading.Thread(target=_post, daemon=True)
        t.start()

    def get_workers_config(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self.workers)

# Singleton global in-memory config instance
CONFIG = EngineMemoryConfig()

# Initialize configuration from Vault at startup
try:
    CONFIG.fetch_from_vault()
except Exception as _e:
    logger.warning(f"Initial Vault fetch failed: {_e}")
