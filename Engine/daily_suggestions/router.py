from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from .scheduler import scheduler, get_daily_suggestions_status
from .vault_client import (
    fetch_latest_daily_suggestions,
    fetch_previous_daily_suggestions,
    save_suggestion_completion,
)
from chat.websocket import ws_manager
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.router")
router = APIRouter(prefix="", tags=["Daily Suggestions"])


class SuggestionCompletePayload(BaseModel):
    index: int = Field(..., ge=0, description="Index of suggestion in the daily list")
    completed: bool = Field(default=True, description="True if marked complete, False if unchecked")
    record_id: Optional[int] = Field(default=None, description="Optional target daily suggestions record ID")


class ManualRefreshPayload(BaseModel):
    section: str = Field(default="all", description="Section to refresh: 'weather', 'news', 'suggestions', 'location_change', or 'all'")
    force_regenerate: bool = Field(default=False, description="Forces re-generation of daily suggestions even if on same day")


@router.get("/daily_suggestions", status_code=status.HTTP_200_OK)
async def get_daily_suggestions_page_data():
    """
    Returns today's data, previous data fallback, and scheduler refresh statuses.
    """
    try:
        latest = await asyncio.to_thread(fetch_latest_daily_suggestions)
        previous = await asyncio.to_thread(fetch_previous_daily_suggestions, skip_today=True)
        scheduler_status = get_daily_suggestions_status()

        return {
            "status": "success",
            "today": latest or {
                "id": None,
                "suggestions": [],
                "completed": [],
                "weather": {},
                "news": [],
                "music": [],
                "entertainment": [],
            },
            "previous": previous or {},
            "scheduler": scheduler_status,
        }
    except Exception as e:
        log_error(f"[DailySuggestionsRouter] Error fetching page data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve daily suggestions data: {str(e)}"},
        )


@router.get("/daily_suggestions/previous", status_code=status.HTTP_200_OK)
async def get_previous_daily_suggestions_endpoint(skip_today: bool = Query(True)):
    try:
        previous = await asyncio.to_thread(fetch_previous_daily_suggestions, skip_today=skip_today)
        return previous or {}
    except Exception as e:
        log_error(f"[DailySuggestionsRouter] Error fetching previous suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to retrieve previous suggestions: {str(e)}"},
        )


@router.post("/daily_suggestions/refresh", status_code=status.HTTP_200_OK)
async def trigger_manual_refresh(
    payload: Optional[ManualRefreshPayload] = None,
    section: Optional[str] = Query(None),
    force_regenerate: bool = Query(False),
):
    """
    Manually triggers refresh for Weather, News, Suggestions, or All.
    - Weather & News: always fetch fresh data, cancelling any in-progress tasks.
    - Suggestions: constant for the day unless force_regenerate is True or it is a new day.
    """
    target_section = (section or (payload.section if payload else "all")).lower().strip()
    force_regen = force_regenerate or (payload.force_regenerate if payload else False)
    try:
        log(f"[DailySuggestionsRouter] Manual refresh requested for section: '{target_section}', force_regenerate: {force_regen}")
        results = await scheduler.trigger_refresh(target_section, force_regenerate_suggestions=force_regen)
        return {
            "status": "success",
            "section": target_section,
            "results": results,
            "scheduler": get_daily_suggestions_status(),
        }
    except Exception as e:
        log_error(f"[DailySuggestionsRouter] Error triggering manual refresh: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Manual refresh failed: {str(e)}"},
        )


@router.post("/daily_suggestions/complete", status_code=status.HTTP_200_OK)
async def complete_suggestion_endpoint(payload: SuggestionCompletePayload):
    """
    Toggles completion state of a suggestion by index:
      - Adds index to completed list when true (preventing duplicates)
      - Removes index from completed list when false
      - Persists to Vault
      - Broadcasts update via WebSockets
    """
    try:
        res = await asyncio.to_thread(
            save_suggestion_completion,
            index=payload.index,
            completed=payload.completed,
            record_id=payload.record_id,
        )

        completed_indices = res.get("completed", [])

        # Broadcast real-time completion event
        try:
            await ws_manager.broadcast_daily_suggestions_update(
                "completion",
                {
                    "completed": completed_indices,
                    "index": payload.index,
                    "is_completed": payload.completed,
                    "record_id": res.get("id"),
                }
            )
        except Exception as e:
            logger.debug(f"Failed to broadcast completion event: {e}")

        return {
            "status": "success",
            "record_id": res.get("id"),
            "completed": completed_indices,
        }
    except Exception as e:
        log_error(f"[DailySuggestionsRouter] Error updating suggestion completion: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Failed to update completion state: {str(e)}"},
        )


@router.get("/daily_suggestions/status", status_code=status.HTTP_200_OK)
async def get_daily_suggestions_scheduler_status():
    return get_daily_suggestions_status()
