from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
import requests

def load_services_json() -> Dict[str, str]:
    candidate_paths = [
        Path(os.getenv('SERVICES_JSON_PATH', '')),
        Path(__file__).resolve().parent.parent / 'scripts' / 'services.json',
        Path(__file__).resolve().parent.parent / 'services.json',
        Path.cwd() / 'scripts' / 'services.json',
        Path.cwd() / 'services.json',
    ]
    for p in candidate_paths:
        if p and p.exists() and p.is_file():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return {}
SERVICES: Dict[str, str] = load_services_json()

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
VAULT_URL: Optional[str] = os.getenv('VAULT_URL', get_service_url('vault'))
REDIS_HOST: str = 'localhost'
REDIS_PORT: int = 6379
REDIS_DB: int = 0
REDIS_PASSWORD: Optional[str] = None
REDIS_PROTOCOL: int = 2
REDIS_DECODE_RESPONSES: bool = True
_mb_url = os.getenv('MESSAGE_BROKER_URL', SERVICES.get('message_broker', ''))
_parsed_mb_host: Optional[str] = None
_parsed_mb_port: Optional[int] = None
if _mb_url:
    _clean_mb = _mb_url.replace('http://', '').replace('https://', '').rstrip('/')
    if ':' in _clean_mb:
        _parts = _clean_mb.split(':')
        _parsed_mb_host = _parts[0]
        _parsed_mb_port = int(_parts[1]) if _parts[1].isdigit() else None
    else:
        _parsed_mb_host = _clean_mb
_env_mb_host = os.getenv('HOST', os.getenv('SERVER_HOST'))
_env_mb_port = os.getenv('PORT')
SERVER_HOST: str = _env_mb_host or _parsed_mb_host or '127.0.0.1'
SERVER_PORT: Optional[int] = int(_env_mb_port) if _env_mb_port and _env_mb_port.isdigit() else _parsed_mb_port
SERVER_RELOAD: bool = os.getenv('SERVER_RELOAD', 'false').lower() in ('true', '1', 'yes')

def apply_config_dict(cfg: Dict[str, Any]) -> None:
    global REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, REDIS_PROTOCOL, REDIS_DECODE_RESPONSES
    global SERVER_HOST, SERVER_RELOAD
    if 'REDIS_HOST' in cfg and cfg['REDIS_HOST'] is not None:
        REDIS_HOST = str(cfg['REDIS_HOST'])
    if 'REDIS_PORT' in cfg and cfg['REDIS_PORT'] is not None:
        REDIS_PORT = int(cfg['REDIS_PORT'])
    if 'REDIS_DB' in cfg and cfg['REDIS_DB'] is not None:
        REDIS_DB = int(cfg['REDIS_DB'])
    if 'REDIS_PASSWORD' in cfg:
        REDIS_PASSWORD = cfg['REDIS_PASSWORD']
    if 'REDIS_PROTOCOL' in cfg and cfg['REDIS_PROTOCOL'] is not None:
        REDIS_PROTOCOL = int(cfg['REDIS_PROTOCOL'])
    if 'REDIS_DECODE_RESPONSES' in cfg and cfg['REDIS_DECODE_RESPONSES'] is not None:
        REDIS_DECODE_RESPONSES = bool(cfg['REDIS_DECODE_RESPONSES'])
    if 'SERVER_HOST' in cfg and cfg['SERVER_HOST'] is not None:
        SERVER_HOST = str(cfg['SERVER_HOST'])
    if 'SERVER_RELOAD' in cfg and cfg['SERVER_RELOAD'] is not None:
        SERVER_RELOAD = bool(cfg['SERVER_RELOAD'])

def fetch_config(vault_base_url: Optional[str]=None) -> Dict[str, Any]:
    url = vault_base_url or VAULT_URL or get_service_url('vault')
    if not url:
        return {}
    endpoint = f"{url.rstrip('/')}/config/message_broker"
    response = requests.get(endpoint, timeout=3.0)
    response.raise_for_status()
    remote_cfg = response.json()
    apply_config_dict(remote_cfg)
    return remote_cfg
fetch_and_store_config = fetch_config
