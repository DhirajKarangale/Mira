from __future__ import annotations

from datetime import datetime
import platform
import sys
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
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


@router.get(
    "/logs",
    response_model=List[LogEntryResponse],
    status_code=status.HTTP_200_OK
)
async def get_logs(
    module_name: str = Query("all"),
    start_date: Optional[str] = Query(None, pattern=r"^\d{2}-\d{2}-\d{4}$"),
    end_date: Optional[str] = Query(None, pattern=r"^\d{2}-\d{2}-\d{4}$"),
    date: Optional[str] = Query(None, pattern=r"^\d{2}-\d{2}-\d{4}$"),
    limit: Optional[int] = Query(None, ge=1, le=1000)
):
    parsed_start = None
    parsed_end = None

    if date:
        try:
            parsed_start = datetime.strptime(date, "%d-%m-%Y").date()
            parsed_end = parsed_start
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": f"Invalid date format: '{date}'. Use dd-mm-yyyy."}
            )

    if start_date:
        try:
            parsed_start = datetime.strptime(start_date, "%d-%m-%Y").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": f"Invalid start_date format: '{start_date}'. Use dd-mm-yyyy."}
            )

    if end_date:
        try:
            parsed_end = datetime.strptime(end_date, "%d-%m-%Y").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": f"Invalid end_date format: '{end_date}'. Use dd-mm-yyyy."}
            )

    try:
        return await log_manager.get_logs(
            module_name=module_name,
            start_date=parsed_start,
            end_date=parsed_end,
            limit=limit
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": str(ve)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve logs: {str(e)}"}
        )


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


@router.get(
    "/config",
    status_code=status.HTTP_200_OK
)
async def get_config_by_query(key: str = Query(..., min_length=1)):
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

