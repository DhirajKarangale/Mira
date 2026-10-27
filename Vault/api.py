from __future__ import annotations
from datetime import datetime, date
import logging
import platform
import sys
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
import config
import config_storage
import log_manager
logger = logging.getLogger('mira.vault.api')
router = APIRouter(prefix='', tags=['Vault'])

@router.get('/health', status_code=status.HTTP_200_OK)
async def health():
    return {'service': 'Vault', 'status': 'online'}

class LogCreateRequest(BaseModel):
    module_name: str = Field(..., min_length=1)
    data: str = Field(...)

class LogCreateResponse(BaseModel):
    message: str = Field('Log added successfully')

class LogEntryResponse(BaseModel):
    id: int = Field(...)
    module_name: str = Field(...)
    timestamp: str = Field(...)
    data: str = Field(...)

@router.post('/logs', response_model=LogCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_log(request: LogCreateRequest):
    try:
        await log_manager.append_log(module_name=request.module_name, data=request.data)
        return {'message': 'Log added successfully'}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to record log: {str(e)}'})

def parse_flexible_date(date_str: Optional[str]) -> Optional[date]:
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.strip()
    if not cleaned:
        return None
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass
    return None

class LogConfigUpdateRequest(BaseModel):
    retention_period: Optional[int] = Field(None, ge=1, le=365)
    show_logs_vault: Optional[bool] = None
    show_logs_operator: Optional[bool] = None
    show_logs_engine: Optional[bool] = None
    show_logs_memory: Optional[bool] = None
    show_logs_client: Optional[bool] = None
    show_logs_message_broker: Optional[bool] = None
    store_logs_vault: Optional[bool] = None
    store_logs_operator: Optional[bool] = None
    store_logs_engine: Optional[bool] = None
    store_logs_memory: Optional[bool] = None
    store_logs_client: Optional[bool] = None
    store_logs_message_broker: Optional[bool] = None

@router.post('/config/logs', status_code=status.HTTP_200_OK)
async def update_logs_config(request: LogConfigUpdateRequest):
    try:
        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        if not updates:
            return config_storage.get_configuration('logs')
        updated = config_storage.update_configuration('logs', updates)
        await log_manager.log_vault_event(f'Log configuration updated: {list(updates.keys())}')
        return updated
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update log configurations: {str(e)}'})

class RedisConfigUpdateRequest(BaseModel):
    REDIS_HOST: Optional[str] = None
    REDIS_PORT: Optional[int] = Field(None, ge=1, le=65535)
    REDIS_DB: Optional[int] = Field(None, ge=0, le=15)
    REDIS_PASSWORD: Optional[str] = None
    REDIS_PROTOCOL: Optional[int] = Field(None, ge=2, le=3)
    REDIS_DECODE_RESPONSES: Optional[bool] = None
    SERVER_HOST: Optional[str] = None
    SERVER_RELOAD: Optional[bool] = None

@router.post('/config/message_broker', status_code=status.HTTP_200_OK)
async def update_message_broker_config(request: RedisConfigUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        if 'REDIS_PASSWORD' in updates and updates['REDIS_PASSWORD'] == '':
            updates['REDIS_PASSWORD'] = None
        if not updates:
            return config_storage.get_configuration('message_broker')
        return config_storage.update_configuration('message_broker', updates)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update Redis configurations: {str(e)}'})
VALID_KB_RETENTIONS = ['Never auto delete', '5 years', '3 years', '1 year', '9 months', '6 months', '3 months']

class OperatorConfigUpdateRequest(BaseModel):
    CAPTURE_INTERVAL_SECS: Optional[int] = Field(None, ge=1, le=3600)
    AUTO_START: Optional[bool] = None
    mic_auto_start: Optional[bool] = None
    MIC_AUTO_START: Optional[bool] = None
    KNOWLEDGE_BASE_RETENTION_PERIOD: Optional[str] = None
    knowledge_base_retention_period: Optional[str] = None

@router.post('/config/operator', status_code=status.HTTP_200_OK)
async def update_operator_config(request: OperatorConfigUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        if 'knowledge_base_retention_period' in updates:
            val = updates.pop('knowledge_base_retention_period')
            if 'KNOWLEDGE_BASE_RETENTION_PERIOD' not in updates and val is not None:
                updates['KNOWLEDGE_BASE_RETENTION_PERIOD'] = val
        if 'MIC_AUTO_START' in updates:
            val = updates.pop('MIC_AUTO_START')
            if 'mic_auto_start' not in updates and val is not None:
                updates['mic_auto_start'] = val
        if 'KNOWLEDGE_BASE_RETENTION_PERIOD' in updates and updates['KNOWLEDGE_BASE_RETENTION_PERIOD'] is not None:
            retention_val = str(updates['KNOWLEDGE_BASE_RETENTION_PERIOD']).strip()
            matched = False
            for valid in VALID_KB_RETENTIONS:
                if retention_val.lower() == valid.lower():
                    updates['KNOWLEDGE_BASE_RETENTION_PERIOD'] = valid
                    matched = True
                    break
            if not matched:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': f"Invalid Knowledge Base retention period '{retention_val}'. Must be one of: {', '.join(VALID_KB_RETENTIONS)}"})
        mic_val = updates.pop('mic_auto_start', None)
        if mic_val is not None:
            config_storage.update_voice_config({'mic_auto_start': mic_val})
        if not updates:
            resp = config_storage.get_configuration('operator')
        else:
            resp = config_storage.update_configuration('operator', updates)
        resp['mic_auto_start'] = config_storage.get_voice_config().get('mic_auto_start', False)
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update Operator configurations: {str(e)}'})

class UserDetailsRequest(BaseModel):
    user_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator('latitude', 'longitude', mode='before')
    @classmethod
    def parse_coords(cls, v):
        if v == '' or v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

@router.get('/user', status_code=status.HTTP_200_OK)
async def get_user_details():
    try:
        data = config_storage.get_configuration('user_details')
        has_data = any((v is not None and str(v).strip() != '' for v in data.values()))
        return {**data, 'exists': has_data}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve user details: {str(e)}'})

@router.post('/user', status_code=status.HTTP_200_OK)
async def save_user_details(request: UserDetailsRequest):
    try:
        raw_updates = request.model_dump(exclude_unset=True)
        updates = {}
        for k, v in raw_updates.items():
            if isinstance(v, str):
                updates[k] = v.strip()
            elif v is not None or k in ('latitude', 'longitude'):
                updates[k] = v
        if not updates:
            data = config_storage.get_configuration('user_details')
            return {**data, 'exists': any((v is not None and str(v).strip() != '' for v in data.values()))}
        updated = config_storage.update_configuration('user_details', updates)
        # Notify Engine so User Knowledge Base updates immediately
        def _notify_engine(data_to_sync):
            try:
                import requests
                eng_url = config.get_service_url('engine')
                if eng_url:
                    requests.post(f"{eng_url.rstrip('/')}/user/profile", json=data_to_sync, timeout=1.5)
            except Exception:
                pass
        import threading
        threading.Thread(target=_notify_engine, args=(updated,), daemon=True).start()
        return {**updated, 'exists': True, 'message': 'User details saved successfully'}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to save user details: {str(e)}'})

class PaginatedLogsResponse(BaseModel):
    items: List[LogEntryResponse]
    total: int
    page: int
    limit: int

@router.get('/logs', response_model=Union[List[LogEntryResponse], PaginatedLogsResponse], status_code=status.HTTP_200_OK)
async def get_logs(response: Response, module_name: str=Query('all'), search: Optional[str]=Query(None), start_date: Optional[str]=Query(None), end_date: Optional[str]=Query(None), date: Optional[str]=Query(None), limit: Optional[int]=Query(50, ge=1, le=1000), offset: int=Query(0, ge=0), page: Optional[int]=Query(None, ge=1), envelope: bool=Query(False)):
    parsed_start = None
    parsed_end = None
    if date:
        parsed_start = parse_flexible_date(date)
        parsed_end = parsed_start
    if start_date:
        parsed_start = parse_flexible_date(start_date)
    if end_date:
        parsed_end = parse_flexible_date(end_date)
    if parsed_start and parsed_end and (parsed_start > parsed_end):
        parsed_start, parsed_end = (parsed_end, parsed_start)
    if page is not None and page >= 1:
        effective_limit = limit or 50
        offset = (page - 1) * effective_limit
    try:
        logs, total_count = await log_manager.get_logs(module_name=module_name, start_date=parsed_start, end_date=parsed_end, search=search, limit=limit, offset=offset)
        response.headers['X-Total-Count'] = str(total_count)
        response.headers['X-Limit'] = str(limit or 50)
        response.headers['X-Offset'] = str(offset)
        if envelope:
            computed_page = page if page is not None else offset // (limit or 50) + 1
            return {'items': logs, 'total': total_count, 'page': computed_page, 'limit': limit or 50}
        return logs
    except Exception as e:
        logger.error(f'Error in get_logs: {e}')
        if envelope:
            return {'items': [], 'total': 0, 'page': page or 1, 'limit': limit or 50}
        return []

class LogDeleteResponse(BaseModel):
    status: str
    message: str
    deleted_count: int
    files_deleted: Optional[int] = 0
    files_modified: Optional[int] = 0

@router.delete('/logs', response_model=LogDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_logs_endpoint(module_name: Optional[str]=Query(None)):
    try:
        result = await log_manager.delete_logs(module_name=module_name)
        return result
    except Exception as e:
        logger.error(f'Error in delete_logs: {e}')
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to delete logs: {str(e)}'})

@router.get('/config/{key}', status_code=status.HTTP_200_OK)
async def get_config_by_path(key: str):
    try:
        return config_storage.get_configuration(key)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve configuration: {str(e)}'})

@router.post('/retention/cleanup', status_code=status.HTTP_200_OK)
async def trigger_cleanup():
    try:
        return log_manager.clean_expired_and_invalid_logs()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Cleanup failed: {str(e)}'})

def detect_os() -> str:
    os_name = platform.system()
    if os_name == 'Windows':
        try:
            win_ver = sys.getwindowsversion()
            version = '11' if win_ver.build >= 22000 else '10'
        except Exception:
            version = platform.release()
        return f'Windows {version}'
    elif os_name == 'Darwin':
        mac_ver = platform.mac_ver()[0]
        ver_major = mac_ver.split('.')[0] if mac_ver else ''
        return f'macOS {ver_major}'.strip()
    elif os_name == 'Linux':
        try:
            import distro
            return distro.name(pretty=True)
        except Exception:
            return f'Linux {platform.release()}'
    return f'{os_name} {platform.release()}'.strip()

@router.get('/os', response_model=str, status_code=status.HTTP_200_OK)
async def get_os() -> str:
    return detect_os()

class AppPermissionItem(BaseModel):
    app_name: str
    app_id: str
    allowed_to_capture: bool = True

class DiscoveredAppItem(BaseModel):
    app_name: str
    app_id: str

class UpdateAppPermissionRequest(BaseModel):
    app_id: str = Field(..., min_length=1)
    allowed_to_capture: bool

def _notify_operator_permission_sync(app_id: str, allowed_to_capture: bool) -> None:
    try:
        import urllib.request
        import json
        operator_url = config.get_service_url('operator')
        if not operator_url:
            return
        operator_url = operator_url.rstrip('/')
        req = urllib.request.Request(f'{operator_url}/apps/permission', data=json.dumps({'app_id': app_id, 'allowed_to_capture': allowed_to_capture}).encode('utf-8'), headers={'Content-Type': 'application/json', 'X-Source': 'Vault'}, method='POST')
        urllib.request.urlopen(req, timeout=1.5)
    except Exception as e:
        logger.debug(f"Could not notify Operator of permission change for '{app_id}': {e}")

@router.post('/services', status_code=status.HTTP_200_OK)
async def update_services_endpoint(services: Dict[str, str]):
    config.set_services(services)
    return {'status': 'success', 'services': config.get_services()}

@router.get('/services', status_code=status.HTTP_200_OK)
async def get_services_endpoint():
    return config.get_services()

@router.get('/apps', response_model=List[AppPermissionItem], status_code=status.HTTP_200_OK)
async def get_apps():
    try:
        return config_storage.get_all_app_permissions()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve app permissions: {str(e)}'})

@router.post('/apps/refresh', status_code=status.HTTP_200_OK)
async def refresh_apps(payload: Union[List[DiscoveredAppItem], Dict[str, Any]]):
    try:
        if isinstance(payload, dict):
            apps_raw = payload.get('apps', [])
        else:
            apps_raw = payload
        apps_list = []
        for item in apps_raw:
            if isinstance(item, dict):
                apps_list.append(item)
            elif hasattr(item, 'model_dump'):
                apps_list.append(item.model_dump())
            elif hasattr(item, 'dict'):
                apps_list.append(item.dict())
        return config_storage.refresh_app_permissions(apps_list)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to refresh app permissions: {str(e)}'})

@router.post('/apps/permission', status_code=status.HTTP_200_OK)
async def update_app_permission_endpoint(request: UpdateAppPermissionRequest):
    try:
        updated = config_storage.update_app_permission(app_id=request.app_id, allowed_to_capture=request.allowed_to_capture)
        import asyncio
        asyncio.create_task(asyncio.to_thread(_notify_operator_permission_sync, request.app_id, request.allowed_to_capture))
        return {'status': 'success', 'message': 'App permission updated successfully', 'app': updated}
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update app permission: {str(e)}'})

class AIConfigResponse(BaseModel):
    id: Optional[int] = None
    llm_provider: str
    total_keys: int = 0
    current_key: int = 0
    keys: List[str] = []

class AIConfigUpdateRequest(BaseModel):
    llm_provider: Optional[str] = None
    keys: Optional[List[str]] = None
    add_keys: Optional[List[str]] = None
    remove_keys: Optional[List[str]] = None
    add_key: Optional[str] = None
    remove_key: Optional[str] = None
    current_key: Optional[int] = None
    total_keys: Optional[int] = None

@router.get('/ai/providers', response_model=List[str], status_code=status.HTTP_200_OK)
async def get_ai_providers():
    try:
        return config_storage.get_all_ai_providers()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve AI providers: {str(e)}'})

@router.get('/ai/configs', response_model=List[AIConfigResponse], status_code=status.HTTP_200_OK)
async def get_all_ai_configs():
    try:
        return config_storage.get_all_ai_configs()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve AI configs: {str(e)}'})

@router.get('/ai/configs/{provider}', response_model=AIConfigResponse, status_code=status.HTTP_200_OK)
async def get_ai_config_by_provider(provider: str):
    try:
        return config_storage.get_ai_config(provider)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve AI config: {str(e)}'})

@router.post('/ai/configs/{provider}', response_model=AIConfigResponse, status_code=status.HTTP_200_OK)
async def update_ai_config_by_provider(provider: str, request: AIConfigUpdateRequest):
    try:
        add_keys = list(request.add_keys) if request.add_keys else []
        if request.add_key and request.add_key.strip():
            add_keys.append(request.add_key.strip())
        remove_keys = list(request.remove_keys) if request.remove_keys else []
        if request.remove_key and request.remove_key.strip():
            remove_keys.append(request.remove_key.strip())
        updated = config_storage.update_ai_config(provider=provider, keys=request.keys, add_keys=add_keys if add_keys else None, remove_keys=remove_keys if remove_keys else None, current_key=request.current_key, total_keys=request.total_keys)
        return updated
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update AI config: {str(e)}'})

@router.delete('/ai/configs/{provider}', status_code=status.HTTP_200_OK)
async def delete_ai_config_endpoint(provider: str):
    try:
        return config_storage.delete_ai_config(provider)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to delete AI config: {str(e)}'})

class AIPrioritiesUpdateRequest(BaseModel):
    priorities: List[str]

@router.get('/ai/priorities', response_model=List[str], status_code=status.HTTP_200_OK)
async def get_ai_priorities_endpoint():
    try:
        return config_storage.get_ai_priorities()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve AI priorities: {str(e)}'})

@router.put('/ai/priorities', response_model=List[str], status_code=status.HTTP_200_OK)
async def update_ai_priorities_endpoint(payload: Union[List[str], AIPrioritiesUpdateRequest, Dict[str, Any]]):
    try:
        if isinstance(payload, list):
            items = payload
        elif hasattr(payload, 'priorities') and payload.priorities is not None:
            items = payload.priorities
        elif isinstance(payload, dict) and 'priorities' in payload:
            items = payload['priorities']
        else:
            raise ValueError("Expected a list of provider names or an object with 'priorities'.")
        return config_storage.update_ai_priorities(items)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update AI priorities: {str(e)}'})

class VoiceModelResponse(BaseModel):
    id: Optional[int] = None
    provider: str
    total_keys: int = 0
    current_key: int = 0
    keys: List[str] = []

class VoiceModelUpdateRequest(BaseModel):
    provider: Optional[str] = None
    keys: Optional[List[str]] = None
    add_keys: Optional[List[str]] = None
    remove_keys: Optional[List[str]] = None
    add_key: Optional[str] = None
    remove_key: Optional[str] = None
    current_key: Optional[int] = None
    total_keys: Optional[int] = None

@router.get('/voice/providers', response_model=List[str], status_code=status.HTTP_200_OK)
async def get_voice_providers():
    try:
        return config_storage.get_all_voice_providers()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve voice providers: {str(e)}'})

@router.get('/voice/models', response_model=List[VoiceModelResponse], status_code=status.HTTP_200_OK)
async def get_all_voice_models():
    try:
        return config_storage.get_all_voice_models()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve voice models: {str(e)}'})

@router.get('/voice/models/{provider}', response_model=VoiceModelResponse, status_code=status.HTTP_200_OK)
async def get_voice_model_by_provider(provider: str):
    try:
        return config_storage.get_voice_model(provider)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve voice model: {str(e)}'})

@router.post('/voice/models/{provider}', response_model=VoiceModelResponse, status_code=status.HTTP_200_OK)
async def update_voice_model_by_provider(provider: str, request: VoiceModelUpdateRequest):
    try:
        add_keys = list(request.add_keys) if request.add_keys else []
        if request.add_key and request.add_key.strip():
            add_keys.append(request.add_key.strip())
        remove_keys = list(request.remove_keys) if request.remove_keys else []
        if request.remove_key and request.remove_key.strip():
            remove_keys.append(request.remove_key.strip())
        updated = config_storage.update_voice_model(
            provider=provider,
            keys=request.keys,
            add_keys=add_keys if add_keys else None,
            remove_keys=remove_keys if remove_keys else None,
            current_key=request.current_key,
            total_keys=request.total_keys
        )
        return updated
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update voice model: {str(e)}'})

@router.delete('/voice/models/{provider}', status_code=status.HTTP_200_OK)
async def delete_voice_model_endpoint(provider: str):
    try:
        return config_storage.delete_voice_model(provider)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to delete voice model: {str(e)}'})

class VoiceKeysResponse(BaseModel):
    provider: str
    keys: List[str] = []
    current_key: int = 0
    total_keys: int = 0

class VoiceCurrentKeyUpdateRequest(BaseModel):
    current_key: Optional[int] = None
    index: Optional[int] = None
    current_key_index: Optional[int] = None
    provider: Optional[str] = "elevenlabs"

@router.get('/voice/elevenlabs/keys', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.get('/voice/keys', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
async def get_voice_keys_endpoint(provider: str = Query('elevenlabs')):
    try:
        return config_storage.get_voice_keys(provider)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve voice keys: {str(e)}'})

@router.post('/voice/elevenlabs/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.put('/voice/elevenlabs/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.post('/voice/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.put('/voice/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.post('/voice/models/{provider}/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
@router.put('/voice/models/{provider}/current-key', response_model=VoiceKeysResponse, status_code=status.HTTP_200_OK)
async def update_voice_current_key_endpoint(
    request: VoiceCurrentKeyUpdateRequest,
    provider: Optional[str] = None
):
    try:
        target_provider = provider or request.provider or 'elevenlabs'
        target_index = None
        if request.current_key is not None:
            target_index = request.current_key
        elif request.index is not None:
            target_index = request.index
        elif request.current_key_index is not None:
            target_index = request.current_key_index

        if target_index is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={'message': "Must provide 'current_key' or 'index' integer value."}
            )

        updated = config_storage.update_voice_current_key(target_provider, int(target_index))
        return {
            'provider': updated['provider'],
            'keys': updated['keys'],
            'current_key': updated['current_key'],
            'total_keys': updated['total_keys'],
        }
    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to update current voice key: {str(e)}'}
        )

class VoiceConfigResponse(BaseModel):
    mic_auto_start: bool = False
    voice_enable_master: bool = False
    voice_enable_while_typing: bool = False
    voice_model_id: str = ""

class VoiceConfigUpdateRequest(BaseModel):
    mic_auto_start: Optional[bool] = None
    voice_enable_master: Optional[bool] = None
    voice_enable_while_typing: Optional[bool] = None
    voice_model_id: Optional[str] = None

@router.get('/voice/config', response_model=VoiceConfigResponse, status_code=status.HTTP_200_OK)
async def get_voice_config_endpoint():
    try:
        return config_storage.get_voice_config()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve voice configuration: {str(e)}'})

@router.post('/voice/config', response_model=VoiceConfigResponse, status_code=status.HTTP_200_OK)
async def update_voice_config_endpoint(request: VoiceConfigUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        return config_storage.update_voice_config(updates)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update voice configuration: {str(e)}'})


class GNewsConfigResponse(BaseModel):
    id: str
    total_keys: int = 0
    current_key: int = 0
    keys: List[str] = []

class GNewsConfigUpdateRequest(BaseModel):
    keys: Optional[List[str]] = None
    add_keys: Optional[List[str]] = None
    remove_keys: Optional[List[str]] = None
    add_key: Optional[str] = None
    remove_key: Optional[str] = None
    current_key: Optional[int] = None

@router.get('/news/config', response_model=GNewsConfigResponse, status_code=status.HTTP_200_OK)
async def get_gnews_config_endpoint():
    try:
        return config_storage.get_gnews_config()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve GNews configuration: {str(e)}'})

@router.post('/news/config', response_model=GNewsConfigResponse, status_code=status.HTTP_200_OK)
async def update_gnews_config_endpoint(request: GNewsConfigUpdateRequest):
    try:
        add_keys = list(request.add_keys) if request.add_keys else []
        if request.add_key and request.add_key.strip():
            add_keys.append(request.add_key.strip())
        remove_keys = list(request.remove_keys) if request.remove_keys else []
        if request.remove_key and request.remove_key.strip():
            remove_keys.append(request.remove_key.strip())
        return config_storage.update_gnews_config(
            keys=request.keys,
            add_keys=add_keys if add_keys else None,
            remove_keys=remove_keys if remove_keys else None,
            current_key=request.current_key
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update GNews configuration: {str(e)}'})

@router.delete('/news/config', status_code=status.HTTP_200_OK)
async def delete_gnews_config_endpoint():
    try:
        return config_storage.delete_gnews_config()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to delete GNews configuration: {str(e)}'})

class EngineWorkersConfig(BaseModel):
    chat_workers: int = Field(default=1, ge=1, le=50, description='Chat workers (1-50)')
    screenshot_extraction_workers: int = Field(default=1, ge=1, le=50, description='Screenshot extraction workers in memory (1-50)')
    screenshot_summarization_workers: int = Field(default=1, ge=1, le=50, description='Screenshot summarization workers in engine (1-50)')
    embedding_vector_store_workers: int = Field(default=1, ge=1, description='Embedding vector store workers in engine (>=1)')
    chat_workers_poll_time: float = Field(default=1.0, ge=0.1, le=1800.0, description='Poll time of chat worker (0.1-1800 sec)')
    screenshot_extraction_poll_time: float = Field(default=5.0, ge=1.0, le=1800.0, description='Poll time of screenshot extraction worker (1-1800 sec)')
    screenshot_summarization_poll_time: float = Field(default=5.0, ge=1.0, le=1800.0, description='Poll time of screenshot summarization (1-1800 sec)')
    embedding_vector_store_workers_poll_time: float = Field(default=1.0, gt=0.0, description='Poll time of embedding vector store workers in engine (>0 sec)')
    llm_workers: Optional[int] = Field(default=None, description='Backward compatibility alias for chat_workers')

class EngineWorkersUpdateRequest(BaseModel):
    chat_workers: Optional[int] = Field(default=None, ge=1, le=50)
    llm_workers: Optional[int] = Field(default=None, ge=1, le=50)
    screenshot_extraction_workers: Optional[int] = Field(default=None, ge=1, le=50)
    screenshot_summarization_workers: Optional[int] = Field(default=None, ge=1, le=50)
    embedding_vector_store_workers: Optional[int] = Field(default=None, ge=1)
    chat_workers_poll_time: Optional[float] = Field(default=None, ge=0.1, le=1800.0)
    llm_workers_poll_time: Optional[float] = Field(default=None, ge=0.1, le=1800.0)
    screenshot_extraction_poll_time: Optional[float] = Field(default=None, ge=1.0, le=1800.0)
    screenshot_summarization_poll_time: Optional[float] = Field(default=None, ge=1.0, le=1800.0)
    embedding_vector_store_workers_poll_time: Optional[float] = Field(default=None, gt=0.0)

@router.get('/engine/workers', response_model=EngineWorkersConfig, status_code=status.HTTP_200_OK)
async def get_engine_workers_endpoint():
    try:
        return config_storage.get_engine_workers()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve engine workers config: {str(e)}'})

@router.put('/engine/workers', response_model=EngineWorkersConfig, status_code=status.HTTP_200_OK)
async def update_engine_workers_endpoint(payload: Union[EngineWorkersUpdateRequest, Dict[str, Any]]):
    try:
        data = payload.model_dump(exclude_unset=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_unset=True) if hasattr(payload, 'dict') else dict(payload)
        return config_storage.update_engine_workers(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to update engine workers config: {str(e)}'})

class SystemStorageResponse(BaseModel):
    system_storage_path: str
    knowledge_base_path: str
    logs_path: str

@router.get('/system/storage', response_model=SystemStorageResponse, status_code=status.HTTP_200_OK)
async def get_system_storage_endpoint():
    try:
        sys_path = str(config.SYSTEM_DIR.resolve())
        kb_path = str((config.SYSTEM_DIR / 'knowledge_base').resolve())
        logs_path = str(config.LOGS_DIR.resolve())
        return {'system_storage_path': sys_path, 'knowledge_base_path': kb_path, 'logs_path': logs_path}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Failed to retrieve system storage path: {str(e)}'})

class CryptoEncryptRequest(BaseModel):
    data: str = Field(..., description='Plaintext string to encrypt')

class CryptoEncryptResponse(BaseModel):
    ciphertext: str = Field(..., description='Encrypted base64 ciphertext')

class CryptoDecryptRequest(BaseModel):
    ciphertext: str = Field(..., min_length=1, description='Encrypted base64 ciphertext to decrypt')

class CryptoDecryptResponse(BaseModel):
    data: str = Field(..., description='Decrypted plaintext string')

class CryptoBatchEncryptRequest(BaseModel):
    items: List[str] = Field(..., description='List of plaintext strings to encrypt')

class CryptoBatchEncryptResponse(BaseModel):
    ciphertexts: List[str] = Field(..., description='List of encrypted base64 ciphertexts')

class CryptoBatchDecryptRequest(BaseModel):
    ciphertexts: List[str] = Field(..., description='List of encrypted base64 ciphertexts to decrypt')

class CryptoBatchDecryptResponse(BaseModel):
    items: List[str] = Field(..., description='List of decrypted plaintext strings')

@router.post('/crypto/encrypt', response_model=CryptoEncryptResponse, status_code=status.HTTP_200_OK)
async def encrypt_data_endpoint(request: CryptoEncryptRequest):
    try:
        import crypto
        ct = crypto.encrypt_text(request.data)
        return {'ciphertext': ct}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Encryption failed: {str(e)}'})

@router.post('/crypto/decrypt', response_model=CryptoDecryptResponse, status_code=status.HTTP_200_OK)
async def decrypt_data_endpoint(request: CryptoDecryptRequest):
    try:
        import crypto
        pt = crypto.decrypt_text(request.ciphertext)
        return {'data': pt}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Decryption failed: {str(e)}'})

@router.post('/crypto/encrypt-batch', response_model=CryptoBatchEncryptResponse, status_code=status.HTTP_200_OK)
async def encrypt_batch_endpoint(request: CryptoBatchEncryptRequest):
    try:
        import crypto
        ciphertexts = crypto.encrypt_batch(request.items)
        return {'ciphertexts': ciphertexts}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Batch encryption failed: {str(e)}'})

@router.post('/crypto/decrypt-batch', response_model=CryptoBatchDecryptResponse, status_code=status.HTTP_200_OK)
async def decrypt_batch_endpoint(request: CryptoBatchDecryptRequest):
    try:
        import crypto
        items = crypto.decrypt_batch(request.ciphertexts)
        return {'items': items}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': f'Batch decryption failed: {str(e)}'})

# ==============================================================================
# Chat Vault APIs
# ==============================================================================

class ChatMessageCreateRequest(BaseModel):
    id: Optional[str] = None
    session_id: Optional[str] = None
    chat_name: Optional[str] = None
    role: str = Field(..., description="Role ('user' or 'ai')")
    content: str = Field(..., description="Message text content")
    created_at: Optional[str] = None

class ChatSessionItem(BaseModel):
    session_id: str
    chat_name: Optional[str] = None
    latest_created_at: str
    created_at: Optional[str] = None
    message_count: Optional[int] = 0

class ChatSessionsListResponse(BaseModel):
    sessions: List[ChatSessionItem]
    total_pages: int
    current_page: int
    total_items: int
    limit: int
    next_cursor: Optional[str] = None
    has_more: bool

class ChatMessageItem(BaseModel):
    id: str
    session_id: str
    chat_name: Optional[str] = None
    role: str
    content: str
    created_at: str

class ChatMessagesListResponse(BaseModel):
    session_id: str
    chat_name: Optional[str] = None
    messages: List[ChatMessageItem]
    total_pages: int
    current_page: int
    total_messages: int
    limit: int
    next_cursor: Optional[str] = None
    has_more: bool

class ChatSessionRenameRequest(BaseModel):
    chat_name: str = Field(..., min_length=1, max_length=100)


@router.get('/chats/sessions', response_model=ChatSessionsListResponse, status_code=status.HTTP_200_OK)
async def get_vault_chat_sessions(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
):
    try:
        result = config_storage.get_chat_sessions(
            limit=limit,
            offset=offset,
            cursor=cursor,
            page=page,
        )
        return result
    except Exception as e:
        logger.error(f'Failed to get chat sessions: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve chat sessions: {str(e)}'}
        )

@router.get('/chats/sessions/{session_id}', response_model=ChatMessagesListResponse, status_code=status.HTTP_200_OK)
async def get_vault_chats_by_session(
    session_id: str,
    limit: int = Query(30, ge=1, le=500),
    offset: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
):
    try:
        result = config_storage.get_chats_by_session(
            session_id=session_id,
            limit=limit,
            offset=offset,
            cursor=cursor,
            page=page,
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get messages for session '{session_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve chat messages: {str(e)}'}
        )

@router.post('/chats', response_model=ChatMessageItem, status_code=status.HTTP_201_CREATED)
async def create_vault_chat_message(request: ChatMessageCreateRequest):
    try:
        role = request.role.lower().strip()
        if role not in ('user', 'ai'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={'message': "Role must be 'user' or 'ai'"}
            )
        saved = config_storage.save_chat_message(
            session_id=request.session_id or "",
            role=role,
            content=request.content,
            chat_name=request.chat_name,
            message_id=request.id,
            created_at=request.created_at,
        )
        return saved
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={'message': str(e)})
    except Exception as e:
        logger.error(f'Failed to save chat message: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to store chat message: {str(e)}'}
        )

@router.patch('/chats/sessions/{session_id}', status_code=status.HTTP_200_OK)
async def rename_vault_chat_session(session_id: str, request: ChatSessionRenameRequest):
    try:
        clean_sid = (session_id or "").strip()
        clean_name = (request.chat_name or "").strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={'message': 'chat_name cannot be empty'}
            )
        updated = config_storage.update_chat_session_name(clean_sid, clean_name)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={'message': f"Chat session '{clean_sid}' not found."}
            )
        return {'status': 'success', 'session_id': clean_sid, 'chat_name': clean_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rename session '{session_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to update session name: {str(e)}'}
        )

@router.delete('/chats/all', status_code=status.HTTP_200_OK)
async def delete_all_vault_chats():
    try:
        deleted_count = config_storage.delete_all_chats()
        return {
            'status': 'success',
            'message': f"All chats deleted ({deleted_count} messages removed).",
            'deleted_count': deleted_count,
        }
    except Exception as e:
        logger.error(f"Failed to delete all chats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to delete all chats: {str(e)}'}
        )

@router.delete('/chats/sessions/{session_id}', status_code=status.HTTP_200_OK)
async def delete_vault_chat_session(session_id: str):
    try:
        config_storage.delete_chat_session(session_id)
        return {'status': 'success', 'message': f"Chat session '{session_id}' deleted."}
    except Exception as e:
        logger.error(f"Failed to delete chat session '{session_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to delete chat session: {str(e)}'}
        )

@router.post('/chats/cleanup', status_code=status.HTTP_200_OK)
async def cleanup_vault_chats():
    try:
        deleted = config_storage.cleanup_duplicate_chats()
        return {'status': 'success', 'deleted': deleted}
    except Exception as e:
        logger.error(f"Failed to cleanup duplicate chats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to cleanup duplicate chats: {str(e)}'}
        )


# ==============================================================================
# Daily Suggestions Endpoints
# ==============================================================================

class DailySuggestionsUpdateRequest(BaseModel):
    record_id: Optional[int] = None
    date_suggestions: Optional[str] = None
    suggestions: Optional[List[str]] = None
    completed: Optional[Union[List[int], str]] = None
    date_weather: Optional[str] = None
    weather: Optional[Dict[str, Any]] = None
    date_news: Optional[str] = None
    news: Optional[List[Dict[str, Any]]] = None
    date_music: Optional[str] = None
    music: Optional[List[Dict[str, Any]]] = None
    date_entertainment: Optional[str] = None
    entertainment: Optional[List[Dict[str, Any]]] = None


class SuggestionCompleteRequest(BaseModel):
    index: int
    completed: bool = True
    record_id: Optional[int] = None


@router.get('/daily_suggestions/today', status_code=status.HTTP_200_OK)
async def get_today_daily_suggestions_endpoint(date_str: Optional[str] = Query(None)):
    try:
        data = config_storage.find_daily_suggestions_entry_for_today(date_str=date_str)
        return data or {}
    except Exception as e:
        logger.error(f"Failed to fetch today daily suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve today daily suggestions: {str(e)}'}
        )


@router.get('/daily_suggestions/latest', status_code=status.HTTP_200_OK)
async def get_latest_daily_suggestions_endpoint():
    try:
        data = config_storage.get_latest_daily_suggestions()
        if not data:
            return {
                "id": None,
                "suggestions": [],
                "completed": [],
                "weather": {},
                "news": [],
                "music": [],
                "entertainment": [],
            }
        return data
    except Exception as e:
        logger.error(f"Failed to fetch daily suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve daily suggestions: {str(e)}'}
        )


@router.get('/daily_suggestions/previous', status_code=status.HTTP_200_OK)
async def get_previous_daily_suggestions_endpoint(skip_today: bool = Query(True)):
    try:
        data = config_storage.get_previous_daily_suggestions(skip_today=skip_today)
        return data or {}
    except Exception as e:
        logger.error(f"Failed to fetch previous daily suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve previous daily suggestions: {str(e)}'}
        )


@router.get('/daily_suggestions/history', status_code=status.HTTP_200_OK)
async def get_daily_suggestions_history_endpoint(days: int = Query(14, ge=1, le=90)):
    try:
        return config_storage.get_daily_suggestions_history(days=days)
    except Exception as e:
        logger.error(f"Failed to fetch daily suggestions history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to retrieve suggestions history: {str(e)}'}
        )


@router.post('/daily_suggestions', status_code=status.HTTP_200_OK)
async def save_daily_suggestions_endpoint(request: DailySuggestionsUpdateRequest):
    try:
        data = request.model_dump(exclude_unset=True)
        record_id = data.pop("record_id", None)
        return config_storage.save_daily_suggestions(data, record_id=record_id)
    except Exception as e:
        logger.error(f"Failed to save daily suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to save daily suggestions: {str(e)}'}
        )


@router.post('/daily_suggestions/completed', status_code=status.HTTP_200_OK)
async def update_suggestion_completion_endpoint(request: SuggestionCompleteRequest):
    try:
        return config_storage.update_suggestion_completion(
            index=request.index,
            completed=request.completed,
            record_id=request.record_id,
        )
    except Exception as e:
        logger.error(f"Failed to update suggestion completion: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={'message': f'Failed to update completion state: {str(e)}'}
        )




