from __future__ import annotations

from datetime import datetime, date
import logging
import platform
import sys
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

import config_storage
import log_manager

router = APIRouter(prefix="", tags=["Vault"])


class LogCreateRequest(BaseModel):
    module_name: str = Field(..., min_length=1)
    data: str = Field(...)


class LogCreateResponse(BaseModel):
    message: str = Field("Log added successfully")


class LogEntryResponse(BaseModel):
    id: int = Field(...)
    module_name: str = Field(...)
    timestamp: str = Field(...)
    data: str = Field(...)


@router.post(
    "/logs",
    response_model=LogCreateResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_log(request: LogCreateRequest):
    try:
        await log_manager.append_log(
            module_name=request.module_name,
            data=request.data
        )
        return {"message": "Log added successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to record log: {str(e)}"}
        )


def parse_flexible_date(date_str: Optional[str]) -> Optional[date]:
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.strip()
    if not cleaned:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass
    return None


class LogConfigUpdateRequest(BaseModel):
    retention_period: Optional[int] = Field(None, ge=1, le=365)
    show_logs_operator: Optional[bool] = None
    show_logs_engine: Optional[bool] = None
    show_logs_memory: Optional[bool] = None
    show_logs_client: Optional[bool] = None
    show_logs_message_broker: Optional[bool] = None
    store_logs_operator: Optional[bool] = None
    store_logs_engine: Optional[bool] = None
    store_logs_memory: Optional[bool] = None
    store_logs_client: Optional[bool] = None
    store_logs_message_broker: Optional[bool] = None


@router.post(
    "/config/logs",
    status_code=status.HTTP_200_OK
)
async def update_logs_config(request: LogConfigUpdateRequest):
    try:
        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        if not updates:
            return config_storage.get_configuration("logs")
        return config_storage.update_configuration("logs", updates)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to update log configurations: {str(e)}"}
        )


class RedisConfigUpdateRequest(BaseModel):
    REDIS_HOST: Optional[str] = None
    REDIS_PORT: Optional[int] = Field(None, ge=1, le=65535)
    REDIS_DB: Optional[int] = Field(None, ge=0, le=15)
    REDIS_PASSWORD: Optional[str] = None
    REDIS_PROTOCOL: Optional[int] = Field(None, ge=2, le=3)
    REDIS_DECODE_RESPONSES: Optional[bool] = None
    SERVER_HOST: Optional[str] = None
    SERVER_RELOAD: Optional[bool] = None


@router.post(
    "/config/message_broker",
    status_code=status.HTTP_200_OK
)
async def update_message_broker_config(request: RedisConfigUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        if "REDIS_PASSWORD" in updates and updates["REDIS_PASSWORD"] == "":
            updates["REDIS_PASSWORD"] = None
        if not updates:
            return config_storage.get_configuration("message_broker")
        return config_storage.update_configuration("message_broker", updates)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to update Redis configurations: {str(e)}"}
        )


class OperatorConfigUpdateRequest(BaseModel):
    CAPTURE_INTERVAL_SECS: Optional[int] = Field(None, ge=1, le=3600)
    AUTO_START: Optional[bool] = None


@router.post(
    "/config/operator",
    status_code=status.HTTP_200_OK
)
async def update_operator_config(request: OperatorConfigUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        if not updates:
            return config_storage.get_configuration("operator")
        return config_storage.update_configuration("operator", updates)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to update Operator configurations: {str(e)}"}
        )


class UserDetailsRequest(BaseModel):
    user_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


@router.get("/user", status_code=status.HTTP_200_OK)
async def get_user_details():
    try:
        data = config_storage.get_configuration("user_details")
        has_data = any(v is not None and str(v).strip() != "" for v in data.values())
        return {
            **data,
            "exists": has_data
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve user details: {str(e)}"}
        )


@router.post("/user", status_code=status.HTTP_200_OK)
async def save_user_details(request: UserDetailsRequest):
    try:
        raw_updates = request.model_dump(exclude_unset=True)
        updates = {
            k: v.strip() if isinstance(v, str) else v
            for k, v in raw_updates.items()
            if v is not None
        }
        if not updates:
            data = config_storage.get_configuration("user_details")
            return {
                **data,
                "exists": any(v is not None and str(v).strip() != "" for v in data.values())
            }

        updated = config_storage.update_configuration("user_details", updates)
        return {
            **updated,
            "exists": True,
            "message": "User details saved successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to save user details: {str(e)}"}
        )



class PaginatedLogsResponse(BaseModel):
    items: List[LogEntryResponse]
    total: int
    page: int
    limit: int


@router.get(
    "/logs",
    response_model=Union[List[LogEntryResponse], PaginatedLogsResponse],
    status_code=status.HTTP_200_OK
)
async def get_logs(
    response: Response,
    module_name: str = Query("all"),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    limit: Optional[int] = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    page: Optional[int] = Query(None, ge=1),
    envelope: bool = Query(False),
):
    parsed_start = None
    parsed_end = None

    if date:
        parsed_start = parse_flexible_date(date)
        parsed_end = parsed_start

    if start_date:
        parsed_start = parse_flexible_date(start_date)

    if end_date:
        parsed_end = parse_flexible_date(end_date)

    # Gracefully normalize start and end dates
    if parsed_start and parsed_end and parsed_start > parsed_end:
        parsed_start, parsed_end = parsed_end, parsed_start

    if page is not None and page >= 1:
        effective_limit = limit or 50
        offset = (page - 1) * effective_limit

    try:
        logs, total_count = await log_manager.get_logs(
            module_name=module_name,
            start_date=parsed_start,
            end_date=parsed_end,
            search=search,
            limit=limit,
            offset=offset
        )
        response.headers["X-Total-Count"] = str(total_count)
        response.headers["X-Limit"] = str(limit or 50)
        response.headers["X-Offset"] = str(offset)

        if envelope:
            computed_page = page if page is not None else (offset // (limit or 50) + 1)
            return {
                "items": logs,
                "total": total_count,
                "page": computed_page,
                "limit": limit or 50,
            }

        return logs
    except Exception as e:
        logger = logging.getLogger("mira.vault.api")
        logger.error(f"Error in get_logs: {e}")
        if envelope:
            return {
                "items": [],
                "total": 0,
                "page": page or 1,
                "limit": limit or 50,
            }
        return []


@router.get(
    "/config/{key}",
    status_code=status.HTTP_200_OK
)
async def get_config_by_path(key: str):
    try:
        return config_storage.get_configuration(key)
    except KeyError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": str(e)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve configuration: {str(e)}"}
        )


@router.post(
    "/retention/cleanup",
    status_code=status.HTTP_200_OK
)
async def trigger_cleanup():
    try:
        return log_manager.clean_expired_and_invalid_logs()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Cleanup failed: {str(e)}"}
        )


def detect_os() -> str:
    os_name = platform.system()
    if os_name == "Windows":
        try:
            win_ver = sys.getwindowsversion()
            version = "11" if win_ver.build >= 22000 else "10"
        except Exception:
            version = platform.release()
        return f"Windows {version}"
    elif os_name == "Darwin":
        mac_ver = platform.mac_ver()[0]
        ver_major = mac_ver.split(".")[0] if mac_ver else ""
        return f"macOS {ver_major}".strip()
    elif os_name == "Linux":
        try:
            import distro
            return distro.name(pretty=True)
        except Exception:
            return f"Linux {platform.release()}"
    return f"{os_name} {platform.release()}".strip()


@router.get(
    "/os",
    response_model=str,
    status_code=status.HTTP_200_OK
)
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
        operator_url = config.get_service_url("operator")
        if not operator_url:
            return
        operator_url = operator_url.rstrip("/")
        req = urllib.request.Request(
            f"{operator_url}/apps/permission",
            data=json.dumps({"app_id": app_id, "allowed_to_capture": allowed_to_capture}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Source": "Vault"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=1.5)
    except Exception as e:
        logger.debug(f"Could not notify Operator of permission change for '{app_id}': {e}")


@router.post("/services", status_code=status.HTTP_200_OK)
async def update_services_endpoint(services: Dict[str, str]):
    config.set_services(services)
    return {"status": "success", "services": config.get_services()}


@router.get("/services", status_code=status.HTTP_200_OK)
async def get_services_endpoint():
    return config.get_services()


@router.get(
    "/apps",
    response_model=List[AppPermissionItem],
    status_code=status.HTTP_200_OK
)
async def get_apps():
    try:
        return config_storage.get_all_app_permissions()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve app permissions: {str(e)}"}
        )


@router.post(
    "/apps/refresh",
    status_code=status.HTTP_200_OK
)
async def refresh_apps(payload: Union[List[DiscoveredAppItem], Dict[str, Any]]):
    try:
        if isinstance(payload, dict):
            apps_raw = payload.get("apps", [])
        else:
            apps_raw = payload

        apps_list = []
        for item in apps_raw:
            if isinstance(item, dict):
                apps_list.append(item)
            elif hasattr(item, "model_dump"):
                apps_list.append(item.model_dump())
            elif hasattr(item, "dict"):
                apps_list.append(item.dict())

        return config_storage.refresh_app_permissions(apps_list)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to refresh app permissions: {str(e)}"}
        )


@router.post(
    "/apps/permission",
    status_code=status.HTTP_200_OK
)
@router.put(
    "/apps/permission",
    status_code=status.HTTP_200_OK
)
async def update_app_permission_endpoint(request: UpdateAppPermissionRequest):
    try:
        updated = config_storage.update_app_permission(
            app_id=request.app_id,
            allowed_to_capture=request.allowed_to_capture
        )
        import asyncio
        asyncio.create_task(asyncio.to_thread(_notify_operator_permission_sync, request.app_id, request.allowed_to_capture))

        return {
            "status": "success",
            "message": "App permission updated successfully",
            "app": updated
        }
    except KeyError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": str(e)}
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": str(e)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to update app permission: {str(e)}"}
        )


