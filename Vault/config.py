from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Dict, Optional

def load_services_json() -> Dict[str, str]:
    candidate_paths = [Path(os.getenv('SERVICES_JSON_PATH', '')), Path(__file__).resolve().parent.parent / 'services.json', Path.cwd() / 'services.json']
    for p in candidate_paths:
        if p and p.exists() and p.is_file():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return {}
SERVICES: Dict[str, str] = load_services_json()

def set_services(services_map: Dict[str, str]) -> None:
    global SERVICES
    SERVICES.update({k.lower().replace('-', '_'): v.rstrip('/') for k, v in services_map.items()})

def get_services() -> Dict[str, str]:
    return dict(SERVICES)

def get_service_url(module_name: str, default: Optional[str]=None) -> Optional[str]:
    key = module_name.lower().replace('-', '_')
    if key in SERVICES:
        return SERVICES[key]
    env_key = f'{key.upper()}_URL'
    if env_key in os.environ:
        return os.environ[env_key].rstrip('/')
    try:
        fresh_services = load_services_json()
        if key in fresh_services:
            SERVICES[key] = fresh_services[key].rstrip('/')
            return SERVICES[key]
    except Exception:
        pass
    if default is not None:
        return default
    return None
_vault_url = os.getenv('VAULT_URL', SERVICES.get('vault', ''))
_parsed_host: Optional[str] = None
_parsed_port: Optional[int] = None
if _vault_url:
    _clean_url = _vault_url.replace('http://', '').replace('https://', '').rstrip('/')
    if ':' in _clean_url:
        _parts = _clean_url.split(':')
        _parsed_host = _parts[0]
        _parsed_port = int(_parts[1]) if _parts[1].isdigit() else None
    else:
        _parsed_host = _clean_url
_env_host = os.getenv('VAULT_HOST', os.getenv('HOST'))
_env_port = os.getenv('VAULT_PORT', os.getenv('PORT'))
SERVER_HOST: str = _env_host or _parsed_host or '127.0.0.1'
SERVER_PORT: Optional[int] = int(_env_port) if _env_port and _env_port.isdigit() else _parsed_port
SERVER_RELOAD: bool = os.getenv('VAULT_RELOAD', 'false').lower() in ('true', '1', 'yes')
VAULT_DIR: Path = Path(__file__).resolve().parent

def get_default_system_dir() -> Path:
    env_dir = os.getenv('MIRA_SYSTEM_DIR')
    if env_dir:
        return Path(env_dir)

    local_dev_dir = VAULT_DIR / 'system'
    if (VAULT_DIR.parent / 'start.py').exists() and (VAULT_DIR / 'schema.sql').exists() and local_dev_dir.exists():
        return local_dev_dir

    if sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Application Support' / 'MIRA'
    elif sys.platform.startswith('linux'):
        xdg_data = os.getenv('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))
        base = Path(xdg_data) / 'mira'
    else:
        local_app = os.getenv('LOCALAPPDATA', str(Path.home() / 'AppData' / 'Local'))
        base = Path(local_app) / 'MIRA'

    return base / 'system'

def get_default_logs_dir(system_dir: Path) -> Path:
    env_logs = os.getenv('MIRA_LOGS_DIR')
    if env_logs:
        return Path(env_logs)

    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Logs' / 'MIRA'
    elif sys.platform.startswith('linux'):
        xdg_state = os.getenv('XDG_STATE_HOME', str(Path.home() / '.local' / 'state'))
        return Path(xdg_state) / 'mira' / 'logs'
    else:
        return system_dir / 'logs'

SYSTEM_DIR: Path = get_default_system_dir()
LOGS_DIR: Path = get_default_logs_dir(SYSTEM_DIR)
SCHEMA_FILE_PATH: Path = Path(os.getenv('MIRA_SCHEMA_FILE', str(VAULT_DIR / 'schema.sql')))
KEYRING_SERVICE_NAME: str = os.getenv('MIRA_KEYRING_SERVICE', 'MIRA_VAULT')
KEYRING_KEY_NAME: str = os.getenv('MIRA_KEYRING_KEY_NAME', 'master_encryption_key')
KEY_PREFIX: str = os.getenv('MIRA_KEY_PREFIX', 'MIRA_VAULT_PREFIX_SEC_')
KEY_SUFFIX: str = os.getenv('MIRA_KEY_SUFFIX', '_MIRA_VAULT_SUFFIX_KEY')
LOG_FILENAME_FORMAT: str = '%d-%m-%Y.jsonl'
LOG_TIMESTAMP_FORMAT: str = '%d/%m/%YT%H:%M:%S'
