from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import sys
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))
try:
    import config as engine_config
except ImportError:
    import importlib.util
    _spec = importlib.util.spec_from_file_location("engine_config_module", _engine_dir / "config.py")
    engine_config = importlib.util.module_from_spec(_spec)
    sys.modules["engine_config_module"] = engine_config
    _spec.loader.exec_module(engine_config)
_CONFIG_PATH = Path(__file__).resolve().parent / 'config.json'
_WORK_CONFIGS: Dict[str, Any] = {}
_CONFIG_LAST_MTIME: float = 0.0

def load_work_configs(config_path: Optional[Path]=None) -> Dict[str, Any]:
    global _WORK_CONFIGS, _CONFIG_LAST_MTIME
    path = config_path or _CONFIG_PATH
    if path.exists():
        try:
            mtime = path.stat().st_mtime
            with open(path, 'r', encoding='utf-8') as f:
                _WORK_CONFIGS = json.load(f)
                _CONFIG_LAST_MTIME = mtime
                return _WORK_CONFIGS
        except Exception as e:
            from vault_logger import log_error
            log_error(f'Failed to load LLM work config from {path}: {e}')
    _WORK_CONFIGS = {}
    return _WORK_CONFIGS
load_work_configs()

def get_work_config(work: str) -> Dict[str, Any]:
    global _WORK_CONFIGS, _CONFIG_LAST_MTIME
    try:
        if _CONFIG_PATH.exists():
            cur_mtime = _CONFIG_PATH.stat().st_mtime
            if cur_mtime > _CONFIG_LAST_MTIME:
                load_work_configs()
    except Exception:
        pass

    clean_work = work.strip().lower()
    if clean_work in _WORK_CONFIGS:
        return _WORK_CONFIGS[clean_work]
    if 'general' in _WORK_CONFIGS:
        return _WORK_CONFIGS['general']
    if 'summarization' in _WORK_CONFIGS:
        return _WORK_CONFIGS['summarization']
    return {}

def get_temperature(work: str) -> float:
    cfg = get_work_config(work)
    temp = cfg.get('temperature', 0.2)
    try:
        return float(temp)
    except (ValueError, TypeError):
        return 0.2

def get_models_for_work(work: str, provider: str) -> List[str]:
    cfg = get_work_config(work)
    prov = provider.strip().lower()
    models = cfg.get(prov, [])
    if isinstance(models, list) and models:
        return [str(m).strip() for m in models if str(m).strip()]
    return []
get_ai_priorities = engine_config.CONFIG.get_ai_priorities
get_active_provider = engine_config.CONFIG.get_active_provider
set_active_provider = engine_config.CONFIG.set_active_provider
get_provider_config = engine_config.CONFIG.get_provider_config
get_active_key = engine_config.CONFIG.get_active_key
rotate_key = engine_config.CONFIG.rotate_key
set_active_key_index = engine_config.CONFIG.set_active_key_index
