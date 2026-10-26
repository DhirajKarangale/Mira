from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
import logging
from typing import Any, Dict, Optional

from .config import (
    DEFAULT_WEATHER_INTERVAL_HOURS,
    DEFAULT_NEWS_INTERVAL_HOURS,
    DEFAULT_SUGGESTIONS_INTERVAL_HOURS,
)
from .weather_section import refresh_weather_forecast, parse_timestamp
from .news_section import refresh_news
from .suggestions_section import refresh_suggestions
from .vault_client import fetch_latest_daily_suggestions
from config import get_user_profile
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.scheduler")


class DailySuggestionsScheduler:
    """
    Manages three independently scheduled sections: Weather, News, Suggestions.
    - Runs each on startup.
    - Refreshes at configured intervals (Weather: 12h, News: 3h, Suggestions: 24h).
    - Prevents duplicate jobs on application restarts and concurrent workers.
    """

    def __init__(self):
        self._running: bool = False
        self._weather_task: Optional[asyncio.Task] = None
        self._news_task: Optional[asyncio.Task] = None
        self._suggestions_task: Optional[asyncio.Task] = None

        self._weather_lock = asyncio.Lock()
        self._news_lock = asyncio.Lock()
        self._suggestions_lock = asyncio.Lock()

        self._weather_status: str = "idle"
        self._news_status: str = "idle"
        self._suggestions_status: str = "idle"

        self._weather_last_run: Optional[str] = None
        self._news_last_run: Optional[str] = None
        self._suggestions_last_run: Optional[str] = None

        self._weather_next_run: Optional[str] = None
        self._news_next_run: Optional[str] = None
        self._suggestions_next_run: Optional[str] = None

    async def start(self) -> bool:
        if self._running:
            return True
        self._running = True
        log("[DailySuggestionsScheduler] Starting independent workers (Weather 12h, News 3h, Suggestions 24h)...")

        loop = asyncio.get_running_loop()
        self._weather_task = loop.create_task(self._weather_loop(), name="ds_weather_worker")
        self._news_task = loop.create_task(self._news_loop(), name="ds_news_worker")
        self._suggestions_task = loop.create_task(self._suggestions_loop(), name="ds_suggestions_worker")

        log("[DailySuggestionsScheduler] Background tasks launched successfully.")
        return True

    async def stop(self) -> None:
        if not self._running:
            return
        log("[DailySuggestionsScheduler] Stopping daily suggestions workers...")
        self._running = False

        for task in (self._weather_task, self._news_task, self._suggestions_task):
            if task and not task.done():
                task.cancel()

        self._weather_task = None
        self._news_task = None
        self._suggestions_task = None
        log("[DailySuggestionsScheduler] Workers stopped cleanly.")

    # ==========================================================================
    # Independent Loops
    # ==========================================================================

    async def _weather_loop(self) -> None:
        log("[DailySuggestionsScheduler] Weather loop started.")
        # Initial small delay to let other services settle
        await asyncio.sleep(1.0)

        while self._running:
            try:
                # Check if location coordinates are configured before attempting refresh
                user_profile = await asyncio.to_thread(get_user_profile) or {}
                from chat.workflow.weather_tool import get_user_coordinates
                lat, lon, _ = get_user_coordinates(user_profile)
                if lat is None or lon is None:
                    log("[DailySuggestionsScheduler] User location/coordinates not configured. Weather worker idling.")
                    sleep_left = 300.0
                    while sleep_left > 0 and self._running:
                        step = min(sleep_left, 10.0)
                        await asyncio.sleep(step)
                        sleep_left -= step
                    continue

                # 1. Run weather refresh with duplicate guard
                async with self._weather_lock:
                    self._weather_status = "running"
                    self._weather_last_run = datetime.now(timezone.utc).isoformat()
                    try:
                        await refresh_weather_forecast(force=False)
                        self._weather_status = "idle"
                    except Exception as e:
                        self._weather_status = "error"
                        log_error(f"[DailySuggestionsScheduler] Weather refresh error: {e}")

                # 2. Determine sleep duration based on last date_weather
                record = await asyncio.to_thread(fetch_latest_daily_suggestions)
                date_weather_dt = parse_timestamp(record.get("date_weather")) if record else None
                interval_secs = DEFAULT_WEATHER_INTERVAL_HOURS * 3600

                now_utc = datetime.now(timezone.utc)
                if date_weather_dt:
                    if date_weather_dt.tzinfo is None:
                        date_weather_dt = date_weather_dt.replace(tzinfo=timezone.utc)
                    elapsed = (now_utc - date_weather_dt).total_seconds()
                    remaining = max(60.0, interval_secs - elapsed)
                else:
                    remaining = interval_secs

                next_run_dt = now_utc + timedelta(seconds=remaining)
                self._weather_next_run = next_run_dt.isoformat()
                log(f"[DailySuggestionsScheduler] Weather will refresh next in {int(remaining // 60)} minutes ({self._weather_next_run})")

                # Sleep in short increments to allow graceful shutdown
                sleep_left = remaining
                while sleep_left > 0 and self._running:
                    step = min(sleep_left, 10.0)
                    await asyncio.sleep(step)
                    sleep_left -= step

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[DailySuggestionsScheduler] Error in weather loop: {e}")
                await asyncio.sleep(60.0)

    async def _news_loop(self) -> None:
        log("[DailySuggestionsScheduler] News loop started.")
        await asyncio.sleep(2.0)

        while self._running:
            try:
                # Check if user location is configured before attempting news refresh
                user_profile = await asyncio.to_thread(get_user_profile) or {}
                raw_country = (user_profile.get("country") or "").strip()
                city = (user_profile.get("city") or "").strip()
                state = (user_profile.get("state") or "").strip()
                lat = user_profile.get("latitude")
                lon = user_profile.get("longitude")
                if not (raw_country or city or state or (lat is not None and lon is not None)):
                    log("[DailySuggestionsScheduler] User location not configured. News worker idling.")
                    sleep_left = 300.0
                    while sleep_left > 0 and self._running:
                        step = min(sleep_left, 10.0)
                        await asyncio.sleep(step)
                        sleep_left -= step
                    continue

                async with self._news_lock:
                    self._news_status = "running"
                    self._news_last_run = datetime.now(timezone.utc).isoformat()
                    try:
                        await refresh_news(force=False)
                        self._news_status = "idle"
                    except Exception as e:
                        self._news_status = "error"
                        log_error(f"[DailySuggestionsScheduler] News refresh error: {e}")

                record = await asyncio.to_thread(fetch_latest_daily_suggestions)
                date_news_dt = parse_timestamp(record.get("date_news")) if record else None
                interval_secs = DEFAULT_NEWS_INTERVAL_HOURS * 3600

                now_utc = datetime.now(timezone.utc)
                if date_news_dt:
                    if date_news_dt.tzinfo is None:
                        date_news_dt = date_news_dt.replace(tzinfo=timezone.utc)
                    elapsed = (now_utc - date_news_dt).total_seconds()
                    remaining = max(60.0, interval_secs - elapsed)
                else:
                    remaining = interval_secs

                next_run_dt = now_utc + timedelta(seconds=remaining)
                self._news_next_run = next_run_dt.isoformat()
                log(f"[DailySuggestionsScheduler] News will refresh next in {int(remaining // 60)} minutes ({self._news_next_run})")

                sleep_left = remaining
                while sleep_left > 0 and self._running:
                    step = min(sleep_left, 10.0)
                    await asyncio.sleep(step)
                    sleep_left -= step

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[DailySuggestionsScheduler] Error in news loop: {e}")
                await asyncio.sleep(60.0)

    async def _suggestions_loop(self) -> None:
        log("[DailySuggestionsScheduler] Suggestions loop started.")
        await asyncio.sleep(3.0)

        while self._running:
            try:
                record = await asyncio.to_thread(fetch_latest_daily_suggestions)
                has_existing = bool(record and record.get("suggestions") and len(record.get("suggestions", [])) > 0)
                if not has_existing:
                    log("[DailySuggestionsScheduler] No existing suggestions in database. Suggestions worker idling until generated by user.")
                    sleep_left = 300.0
                    while sleep_left > 0 and self._running:
                        step = min(sleep_left, 10.0)
                        await asyncio.sleep(step)
                        sleep_left -= step
                    continue

                async with self._suggestions_lock:
                    self._suggestions_status = "running"
                    self._suggestions_last_run = datetime.now(timezone.utc).isoformat()
                    try:
                        await refresh_suggestions(force=False)
                        self._suggestions_status = "idle"
                    except Exception as e:
                        self._suggestions_status = "error"
                        log_error(f"[DailySuggestionsScheduler] Suggestions refresh error: {e}")

                record = await asyncio.to_thread(fetch_latest_daily_suggestions)
                date_sugg_dt = parse_timestamp(record.get("date_suggestions")) if record else None
                interval_secs = DEFAULT_SUGGESTIONS_INTERVAL_HOURS * 3600

                now_utc = datetime.now(timezone.utc)
                if date_sugg_dt:
                    if date_sugg_dt.tzinfo is None:
                        date_sugg_dt = date_sugg_dt.replace(tzinfo=timezone.utc)
                    elapsed = (now_utc - date_sugg_dt).total_seconds()
                    remaining = max(60.0, interval_secs - elapsed)
                else:
                    remaining = interval_secs

                next_run_dt = now_utc + timedelta(seconds=remaining)
                self._suggestions_next_run = next_run_dt.isoformat()
                log(f"[DailySuggestionsScheduler] Suggestions will refresh next in {int(remaining // 3600)} hours ({self._suggestions_next_run})")

                sleep_left = remaining
                while sleep_left > 0 and self._running:
                    step = min(sleep_left, 10.0)
                    await asyncio.sleep(step)
                    sleep_left -= step

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[DailySuggestionsScheduler] Error in suggestions loop: {e}")
                await asyncio.sleep(60.0)

    # ==========================================================================
    # Manual Refresh Trigger
    # ==========================================================================

    async def trigger_refresh(self, section: str = "all") -> Dict[str, Any]:
        """Manually triggers refresh for a section (weather, news, suggestions, all)."""
        sec = section.lower().strip()
        results: Dict[str, Any] = {}

        if sec in ("weather", "all"):
            async with self._weather_lock:
                self._weather_status = "running"
                try:
                    results["weather"] = await refresh_weather_forecast(force=True)
                    self._weather_status = "idle"
                    self._weather_last_run = datetime.now(timezone.utc).isoformat()
                except Exception as e:
                    self._weather_status = "error"
                    results["weather_error"] = str(e)

        if sec in ("news", "all"):
            async with self._news_lock:
                self._news_status = "running"
                try:
                    results["news"] = await refresh_news(force=True)
                    self._news_status = "idle"
                    self._news_last_run = datetime.now(timezone.utc).isoformat()
                except Exception as e:
                    self._news_status = "error"
                    results["news_error"] = str(e)

        if sec in ("suggestions", "all"):
            record = await asyncio.to_thread(fetch_latest_daily_suggestions)
            has_existing = bool(record and record.get("suggestions") and len(record.get("suggestions", [])) > 0)
            if sec == "suggestions" or has_existing:
                async with self._suggestions_lock:
                    self._suggestions_status = "running"
                    try:
                        results["suggestions"] = await refresh_suggestions(force=True)
                        self._suggestions_status = "idle"
                        self._suggestions_last_run = datetime.now(timezone.utc).isoformat()
                    except Exception as e:
                        self._suggestions_status = "error"
                        results["suggestions_error"] = str(e)
            else:
                log("[DailySuggestionsScheduler] Skipping suggestions refresh in 'all' because no suggestions exist yet.")

        return results

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "weather": {
                "status": self._weather_status,
                "interval_hours": DEFAULT_WEATHER_INTERVAL_HOURS,
                "last_run": self._weather_last_run,
                "next_run": self._weather_next_run,
            },
            "news": {
                "status": self._news_status,
                "interval_hours": DEFAULT_NEWS_INTERVAL_HOURS,
                "last_run": self._news_last_run,
                "next_run": self._news_next_run,
            },
            "suggestions": {
                "status": self._suggestions_status,
                "interval_hours": DEFAULT_SUGGESTIONS_INTERVAL_HOURS,
                "last_run": self._suggestions_last_run,
                "next_run": self._suggestions_next_run,
            },
        }


scheduler = DailySuggestionsScheduler()


async def start_daily_suggestions() -> bool:
    return await scheduler.start()


async def stop_daily_suggestions() -> None:
    await scheduler.stop()


def get_daily_suggestions_status() -> Dict[str, Any]:
    return scheduler.get_status()
