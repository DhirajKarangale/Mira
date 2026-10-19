from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

import consumer_group_manager as cgm
import redis_service as rs

router = APIRouter(prefix="", tags=["Message Broker"])


class AddJobRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    consumer_key: str = Field(..., min_length=1)
    payload: Optional[Dict[str, Any]] = Field(default_factory=dict)
    callback_url: Optional[str] = None
    target_service: Optional[str] = None

    model_config = ConfigDict(extra="allow")


@router.get("/consumer-groups/clean")
async def clean_consumer_groups_endpoint():
    try:
        report = await rs.clean_all_consumer_groups()
        return report
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clean consumer groups: {str(e)}"
        )


@router.get("/redis/format")
@router.post("/redis/format")
async def format_redis_endpoint():
    try:
        result = await rs.format_all_redis()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to format Redis: {str(e)}"
        )


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
async def add_job_endpoint(job_req: AddJobRequest):
    consumer_group = cgm.get_consumer_group(job_req.consumer_key)
    if not consumer_group:
        valid_keys = list(cgm.get_all_consumer_mappings().keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Invalid consumer_key",
                "message": f"Consumer key '{job_req.consumer_key}' does not exist.",
                "available_keys": valid_keys
            }
        )

    try:
        result = await rs.add_job_to_stream(job_req.model_dump())
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add job to stream: {str(e)}"
        )


@router.get("/jobs")
async def get_job_endpoint(
    consumer_key: str = Query(..., min_length=1)
):
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        valid_keys = list(cgm.get_all_consumer_mappings().keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Invalid consumer_key",
                "message": f"Consumer key '{consumer_key}' is not registered.",
                "available_keys": valid_keys
            }
        )

    try:
        result = await rs.get_job_from_stream(consumer_key)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job from stream: {str(e)}"
        )


@router.get("/jobs/delete")
@router.delete("/jobs")
async def delete_job_endpoint(
    consumer_key: str = Query(..., min_length=1),
    job_id: str = Query(..., min_length=1)
):
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        valid_keys = list(cgm.get_all_consumer_mappings().keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Invalid consumer_key",
                "message": f"Consumer key '{consumer_key}' is not registered.",
                "available_keys": valid_keys
            }
        )

    try:
        result = await rs.delete_job_from_stream(
            consumer_key=consumer_key,
            job_id=job_id
        )
        if result["status"] == "not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete job: {str(e)}"
        )


@router.get("/consumer-groups")
async def list_consumer_groups_endpoint():
    return {
        "consumer_groups": cgm.get_all_consumer_groups(),
        "mappings": cgm.get_all_consumer_mappings()
    }
