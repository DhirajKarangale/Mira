from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import sys

# Ensure parent directory (Engine) is in sys.path
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

import config as engine_config

_CONFIG_PATH = Path(__file__).resolve().parent / "config.json"
_WORK_CONFIGS: Dict[str, Any] = {}

def load_work_configs(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """Loads work configurations from the JSON config file."""
    global _WORK_CONFIGS
    path = config_path or _CONFIG_PATH
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                _WORK_CONFIGS = json.load(f)
                return _WORK_CONFIGS
        except Exception as e:
            from vault_logger import log_error
            log_error(f"Failed to load LLM work config from {path}: {e}")
    # Default fallback if file is missing or invalid
    _WORK_CONFIGS = {
        "summarization": {
            "temperature": 0.1,
            "gemini": ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-2.5-flash-lite"],
            "groq": ["llama-3.3-70b-versatile", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"],
        }
    }
    return _WORK_CONFIGS

# Load at import time
load_work_configs()

def get_work_config(work: str) -> Dict[str, Any]:
    """Returns configuration for the given work type with fallback."""
    clean_work = work.strip().lower()
    if clean_work in _WORK_CONFIGS:
        return _WORK_CONFIGS[clean_work]
    if "general" in _WORK_CONFIGS:
        return _WORK_CONFIGS["general"]
    if "summarization" in _WORK_CONFIGS:
        return _WORK_CONFIGS["summarization"]
    return {
        "temperature": 0.2,
        "gemini": ["gemini-2.5-flash", "gemini-3.8-flash"],
        "groq": ["llama-3.3-70b-versatile", "qwen/qwen3.8-27b"],
    }

def get_temperature(work: str) -> float:
    """Returns temperature for the given work type."""
    cfg = get_work_config(work)
    temp = cfg.get("temperature", 0.2)
    try:
        return float(temp)
    except (ValueError, TypeError):
        return 0.2

def get_models_for_work(work: str, provider: str) -> List[str]:
    """Returns the ordered list of models (including fallbacks) for a work and provider."""
    cfg = get_work_config(work)
    prov = provider.strip().lower()
    models = cfg.get(prov, [])
    if isinstance(models, list) and models:
        return [str(m).strip() for m in models if str(m).strip()]
    return []

# Expose convenience references to global engine memory config
get_ai_priorities = engine_config.CONFIG.get_ai_priorities
get_active_provider = engine_config.CONFIG.get_active_provider
set_active_provider = engine_config.CONFIG.set_active_provider
get_provider_config = engine_config.CONFIG.get_provider_config
get_active_key = engine_config.CONFIG.get_active_key
rotate_key = engine_config.CONFIG.rotate_key
set_active_key_index = engine_config.CONFIG.set_active_key_index
