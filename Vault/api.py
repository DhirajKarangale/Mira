from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

import log_manager

router = APIRouter(prefix="", tags=["Vault"])


class LogCreateRequest(BaseModel):
    module_name: str = Field(..., min_length=1, description="Name of the module producing the log")
    data: str = Field(..., description="Log message string (strictly string)")


class LogCreateResponse(BaseModel):
    message: str = Field("Log added successfully", description="Status message")


class LogEntryResponse(BaseModel):
    id: int = Field(..., description="Sequential count starting at 1 for each daily file")
    module_name: str = Field(..., description="Name of the module")
    timestamp: str = Field(..., description="System timestamp in dd/mm/yyyyTHH:mm:ss format")
    data: str = Field(..., description="Log message string")


@router.post(
    "/logs",
    response_model=LogCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a log entry"
)
async def create_log(request: LogCreateRequest):
    """
    Accepts a module name and log data string.
    Prints the log to the terminal, appends it to the current day's encrypted log file,
    and returns only the message 'Log added successfully'.
    """
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
    status_code=status.HTTP_200_OK,
    summary="Retrieve logs with module_name and date range filters"
)
async def get_logs(
    module_name: str = Query(
        "all",
        description="Filter logs by module name. Defaults to 'all'"
    ),
    start_date: Optional[str] = Query(
        None,
        description="Start date in dd-mm-yyyy format (defaults to today)",
        pattern=r"^\d{2}-\d{2}-\d{4}$"
    ),
    end_date: Optional[str] = Query(
        None,
        description="End date in dd-mm-yyyy format (defaults to today)",
        pattern=r"^\d{2}-\d{2}-\d{4}$"
    ),
    date: Optional[str] = Query(
        None,
        description="Single date shortcut in dd-mm-yyyy format",
        pattern=r"^\d{2}-\d{2}-\d{4}$"
    ),
    limit: Optional[int] = Query(
        None,
        ge=1,
        le=1000,
        description="Maximum number of log entries to return"
    )
):
    """
    Decrypts and returns logs within a date range and module_name filter.
    Defaults module_name to 'all' and date range to today when not provided.
    """
    parsed_start = None
    parsed_end = None

    # Support single 'date' query parameter as a convenience shortcut
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


@router.post(
    "/retention/cleanup",
    status_code=status.HTTP_200_OK,
    summary="Trigger log retention cleanup"
)
async def trigger_cleanup():
    """
    Manually triggers a retention cleanup scan of the logs directory.
    """
    try:
        return log_manager.clean_expired_and_invalid_logs()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Cleanup failed: {str(e)}"}
        )
