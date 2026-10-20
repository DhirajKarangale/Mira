from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

import consumer_group_manager as cgm
import redis_service as rs

router = APIRouter(prefix="", tags=["Message Broker"])


class AddJobRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    consumer_key: str = Field(..., min_length=1)

    model_config = ConfigDict(extra="allow")


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


@router.get("/jobs")
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


@router.get("/jobs/delete")
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


@router.get("/consumer-groups/clean")
async def clean_consumer_groups():
    try:
        return await rs.clean_all_consumer_groups()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": str(e)}
        )


@router.get("/redis/format")
async def format_redis():
    try:
        return await rs.format_all_redis()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": str(e)}
        )


@router.get("/consumer-groups")
async def list_consumer_groups():
    return cgm.get_all_consumer_groups()
