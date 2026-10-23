from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

import consumer_group_manager as cgm
import redis_service as rs

router = APIRouter(prefix="", tags=["Message Broker"])

class AddJobRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    consumer_key: str = Field(..., min_length=1)

    model_config = ConfigDict(extra="allow")

class CleanConsumerGroupRequest(BaseModel):
    group_name: Optional[str] = None
    stream_name: Optional[str] = None
    reset_stream: Optional[bool] = True

@router.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {
        "service": "Message Broker",
        "status": "online"
    }

@router.post("/jobs", status_code=status.HTTP_201_CREATED)
async def add_job(job_req: AddJobRequest):
    if not cgm.get_consumer_group(job_req.consumer_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": f"unknown consumer_key: {job_req.consumer_key}"}
        )

    try:
        return await rs.add_job_to_stream(job_req.model_dump())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": str(e)}
        )

@router.get("/jobs", status_code=status.HTTP_200_OK)
async def get_jobs(
    consumer_key: str = Query(..., min_length=1),
    count: int = Query(1, ge=1, le=10)
):
    if not cgm.get_consumer_group(consumer_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": f"unknown consumer_key: {consumer_key}"}
        )

    try:
        return await rs.get_jobs_from_stream(consumer_key, count)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": str(e)}
        )

@router.delete("/jobs", status_code=status.HTTP_200_OK)
async def delete_job(
    consumer_key: str = Query(..., min_length=1),
    job_id: str = Query(..., min_length=1)
):
    if not cgm.get_consumer_group(consumer_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": f"unknown consumer_key: {consumer_key}"}
        )

    try:
        res = await rs.delete_job_from_stream(consumer_key, job_id)
        if res.get("message") == "job not found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=res
            )
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": str(e)}
        )

@router.get("/redis/consumer-groups", status_code=status.HTTP_200_OK)
async def get_redis_consumer_groups(raw: bool = Query(False)):
    if raw:
        return cgm.get_all_consumer_groups()
    try:
        return await rs.get_consumer_groups_details()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve consumer groups: {str(e)}"}
        )

@router.delete("/redis/consumer-groups/{group_name}", status_code=status.HTTP_200_OK)
async def delete_consumer_group(group_name: str, stream_name: Optional[str] = Query(None)):
    try:
        return await rs.delete_consumer_group(group_name=group_name, stream_name=stream_name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to delete consumer group: {str(e)}"}
        )

@router.post("/redis/clean", status_code=status.HTTP_200_OK)
async def clean_pending_messages(req: Optional[CleanConsumerGroupRequest] = None):
    try:
        group_name = req.group_name if req else None
        stream_name = req.stream_name if req else None
        reset_stream = req.reset_stream if req and req.reset_stream is not None else True
        return await rs.clean_consumer_group(
            group_name=group_name,
            stream_name=stream_name,
            reset_stream=reset_stream
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to clean messages: {str(e)}"}
        )

@router.post("/redis/format", status_code=status.HTTP_200_OK)
async def format_redis():
    try:
        return await rs.format_all_redis()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to format Redis: {str(e)}"}
        )

class StoreImageComparisonRequest(BaseModel):
    image_id: Optional[str] = None
    app_name: str = Field(..., min_length=1)
    timestamp: Optional[Union[int, float, str]] = None
    pixel_values: Optional[Any] = None
    grayscale_matrix: Optional[Any] = None
    metadata: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(extra="allow")

@router.post("/images/comparison", status_code=status.HTTP_201_CREATED)
async def store_image_comparison(req: StoreImageComparisonRequest):
    try:
        return await rs.store_image_comparison_data(req.model_dump())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to store image comparison data: {str(e)}"}
        )

@router.get("/images/comparison", status_code=status.HTTP_200_OK)
async def get_recent_image_comparisons(limit: int = Query(10, ge=1, le=10)):
    try:
        return await rs.get_recent_image_comparison_data(limit=limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve image comparison data: {str(e)}"}
        )

@router.get("/images/comparison/search", status_code=status.HTTP_200_OK)
async def search_image_comparisons(
    app_name: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=10)
):
    try:
        return await rs.search_image_comparison_data(app_name=app_name, limit=limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to search image comparison data: {str(e)}"}
        )

@router.get("/images/comparison/{image_id}", status_code=status.HTTP_200_OK)
async def get_image_comparison_by_id(image_id: str):
    try:
        data = await rs.get_image_comparison_data_by_id(image_id)
        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": f"Image comparison data for ID '{image_id}' not found"}
            )
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve image comparison data: {str(e)}"}
        )

@router.delete("/images/comparison", status_code=status.HTTP_200_OK)
async def delete_image_comparisons(
    image_id: Optional[str] = Query(None),
    app_name: Optional[str] = Query(None),
    all: bool = Query(False)
):
    try:
        return await rs.remove_image_comparison_data(image_id=image_id, app_name=app_name, remove_all=all)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to remove image comparison data: {str(e)}"}
        )
