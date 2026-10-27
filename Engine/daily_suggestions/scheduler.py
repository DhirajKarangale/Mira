from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
import logging
from typing import Any, Dict, List, Optional

from .config import (
    DEFAULT_WEATHER_INTERVAL_HOURS,
    DEFAULT_NEWS_INTERVAL_HOURS,
    DEFAULT_SUGGESTIONS_INTERVAL_HOURS,
)
from .weather_section import refresh_weather_forecast, parse_timestamp
from .news_section import refresh_news
from .suggestions_section import (
    refresh_suggestions,
    is_same_day_as_today,
    check_entry_has_suggestions_for_today,
)
from .vault_client import fetch_latest_daily_suggestions
from chat.workflow.timezone_helper import resolve_user_timezone
from config import get_user_profile
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.scheduler")


class DailySuggestionsScheduler:
    """
    Manages three independently scheduled sections: Weather, News, Suggestions.
    - Weather & News: user can refresh to get fresh data; on location change, any in-progress
      task is cancelled and re-run immediately with the new location.
    - Suggestions: constant for the same calendar day. Refreshing on the same day returns
      the existing data without re-running LLM or wiping completion checkboxes.
    """

    def __init__(self):
        self._running: bool = False
        self._weather_task: Optional[asyncio.Task] = None
        self._news_task: Optional[asyncio.Task] = None
        self._suggestions_task: Optional[asyncio.Task] = None

        self._active_weather_task: Optional[asyncio.Task] = None
        self._active_news_task: Optional[asyncio.Task] = None
        self._active_suggestions_task: Optional[asyncio.Task] = None

        self._weather_lock = asyncio.Lock()
        self._news_lock = asyncio.Lock()
        self._suggestions_lock = asyncio.Lock()

        self._weather_wake_event = asyncio.Event()
        self._news_wake_event = asyncio.Event()
        self._suggestions_wake_event = asyncio.Event()

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
        log("[DailySuggestionsScheduler] Starting independent workers (Weather 12h, News 3h, Suggestions daily)...")

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

        for task in (
            self._weather_task,
            self._news_task,
            self._suggestions_task,
            self._active_weather_task,
            self._active_news_task,
            self._active_suggestions_task,
        ):
            if task and not task.done():
                task.cancel()

        self._weather_task = None
        self._news_task = None
        self._suggestions_task = None
        self._active_weather_task = None
        self._active_news_task = None
        self._active_suggestions_task = None
        log("[DailySuggestionsScheduler] Workers stopped cleanly.")

    # ==========================================================================
    # Task Execution with In-Progress Cancellation
    # ==========================================================================

    async def cancel_and_run_weather(self, force: bool = True) -> Dict[str, Any]:
        """
        Runs weather refresh:
        - If a weather refresh task is currently active/running, cancels it immediately.
        - Starts a fresh weather refresh task and awaits its result.
        """
        async with self._weather_lock:
            if self._active_weather_task and not self._active_weather_task.done():
                log("[DailySuggestionsScheduler] In-progress weather refresh detected. Cancelling it before re-running.")
                self._active_weather_task.cancel()
                try:
                    await asyncio.wait_for(asyncio.shield(self._active_weather_task), timeout=2.0)
                except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                    pass
                self._active_weather_task = None

            self._weather_status = "running"
            self._weather_last_run = datetime.now(timezone.utc).isoformat()

            async def _weather_runner():
                try:
                    return await refresh_weather_forecast(force=force)
                finally:
                    self._weather_status = "idle"

            task = asyncio.create_task(_weather_runner(), name="ds_weather_exec")
            self._active_weather_task = task

            try:
                res = await task
                self._weather_wake_event.set()
                return res
            except asyncio.CancelledError:
                log("[DailySuggestionsScheduler] Weather refresh task cancelled.")
                raise
            except Exception as e:
                self._weather_status = "error"
                log_error(f"[DailySuggestionsScheduler] Weather refresh error: {e}")
                return {"status": "error", "message": str(e)}
            finally:
                if self._active_weather_task == task:
                    self._active_weather_task = None

    async def cancel_and_run_news(self, force: bool = True) -> List[Dict[str, Any]]:
        """
        Runs news refresh:
        - If a news refresh task is currently active/running, cancels it immediately.
        - Starts a fresh news refresh task and awaits its result.
        """
        async with self._news_lock:
            if self._active_news_task and not self._active_news_task.done():
                log("[DailySuggestionsScheduler] In-progress news refresh detected. Cancelling it before re-running.")
                self._active_news_task.cancel()
                try:
                    await asyncio.wait_for(asyncio.shield(self._active_news_task), timeout=2.0)
                except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                    pass
                self._active_news_task = None

            self._news_status = "running"
            self._news_last_run = datetime.now(timezone.utc).isoformat()

            async def _news_runner():
                try:
                    return await refresh_news(force=force)
                finally:
                    self._news_status = "idle"

            task = asyncio.create_task(_news_runner(), name="ds_news_exec")
            self._active_news_task = task

            try:
                res = await task
                self._news_wake_event.set()
                return res
            except asyncio.CancelledError:
                log("[DailySuggestionsScheduler] News refresh task cancelled.")
                raise
            except Exception as e:
                self._news_status = "error"
                log_error(f"[DailySuggestionsScheduler] News refresh error: {e}")
                return []
            finally:
                if self._active_news_task == task:
                    self._active_news_task = None

    async def run_suggestions(self, force_regenerate: bool = False) -> List[str]:
        """
        Runs suggestions check/refresh.
        If suggestions exist for today and force_regenerate is False, preserves constant data.
        """
        async with self._suggestions_lock:
            self._suggestions_status = "running"
            self._suggestions_last_run = datetime.now(timezone.utc).isoformat()

            async def _suggestions_runner():
                try:
                    return await refresh_suggestions(force=False, force_regenerate=force_regenerate)
                finally:
                    self._suggestions_status = "idle"

            task = asyncio.create_task(_suggestions_runner(), name="ds_suggestions_exec")
            self._active_suggestions_task = task

            try:
                res = await task
                return res
            except asyncio.CancelledError:
                log("[DailySuggestionsScheduler] Suggestions task cancelled.")
                raise
            except Exception as e:
                self._suggestions_status = "error"
                log_error(f"[DailySuggestionsScheduler] Suggestions error: {e}")
                return []
            finally:
                if self._active_suggestions_task == task:
                    self._active_suggestions_task = None

    async def handle_location_change(self) -> Dict[str, Any]:
        """
        Invoked on every user location change:
        Checks if weather or news is currently in progress:
          - If getting weather, cancels it.
          - If getting news, cancels it.
        Re-runs both weather and news immediately with the updated location.
        """
        log("[DailySuggestionsScheduler] Location change detected: Checking and cancelling any in-progress weather/news, then re-running...")
        results: Dict[str, Any] = {}
        weather_res, news_res = await asyncio.gather(
            self.cancel_and_run_weather(force=True),
            self.cancel_and_run_news(force=True),
            return_exceptions=True,
        )
        results["weather"] = weather_res if not isinstance(weather_res, Exception) else str(weather_res)
        results["news"] = news_res if not isinstance(news_res, Exception) else str(news_res)
        log("[DailySuggestionsScheduler] Location change refresh completed successfully.")
        return results

    # ==========================================================================
    # Independent Background Loops
    # ==========================================================================

    async def _weather_loop(self) -> None:
        log("[DailySuggestionsScheduler] Weather loop started.")
        await asyncio.sleep(1.0)

        while self._running:
            try:
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

                # Run weather check/refresh
                try:
                    await self.cancel_and_run_weather(force=False)
                except Exception as e:
                    log_error(f"[DailySuggestionsScheduler] Weather loop refresh error: {e}")

                # Determine sleep duration based on last date_weather
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

                # Wait for interval or until interrupted by manual trigger / location change
                self._weather_wake_event.clear()
                try:
                    await asyncio.wait_for(self._weather_wake_event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    pass

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

                # Run news check/refresh
                try:
                    await self.cancel_and_run_news(force=False)
                except Exception as e:
                    log_error(f"[DailySuggestionsScheduler] News loop refresh error: {e}")

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

                # Wait for interval or until interrupted by manual trigger / location change
                self._news_wake_event.clear()
                try:
                    await asyncio.wait_for(self._news_wake_event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    pass

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[DailySuggestionsScheduler] Error in news loop: {e}")
                await asyncio.sleep(60.0)

    async def _suggestions_loop(self) -> None:
        log("[DailySuggestionsScheduler] Suggestions worker started (strictly runs once a day / every 24hr).")
        await asyncio.sleep(2.0)

        while self._running:
            try:
                # 1. On startup and on each cycle: Check if daily_suggestions table has entry for today
                user_profile = await asyncio.to_thread(get_user_profile) or {}
                existing_entry = await check_entry_has_suggestions_for_today(user_profile)

                if existing_entry:
                    log(
                        f"[DailySuggestionsScheduler] Entry with date_suggestions for today found in daily_suggestions table "
                        f"(ID {existing_entry.get('id')}, {len(existing_entry.get('suggestions', []))} suggestions). "
                        "Fine — preserving today's tasks."
                    )
                else:
                    log("[DailySuggestionsScheduler] No entry with date_suggestions for today found in table. Running suggestions...")
                    try:
                        await self.run_suggestions(force_regenerate=False)
                    except Exception as e:
                        log_error(f"[DailySuggestionsScheduler] Suggestions run error: {e}")

                # 2. Compute delay until next calendar day midnight (strictly runs every new day / every 24hr)
                user_profile = await asyncio.to_thread(get_user_profile) or {}
                user_tz = resolve_user_timezone(user_profile)
                now_tz = datetime.now(user_tz)
                tomorrow_midnight = (now_tz + timedelta(days=1)).replace(
                    hour=0, minute=0, second=5, microsecond=0
                )
                remaining = max(60.0, (tomorrow_midnight - now_tz).total_seconds())

                next_run_dt = datetime.now(timezone.utc) + timedelta(seconds=remaining)
                self._suggestions_next_run = next_run_dt.isoformat()
                log(f"[DailySuggestionsScheduler] Suggestions will run next at new day midnight in {int(remaining // 3600)}h {int((remaining % 3600) // 60)}m ({self._suggestions_next_run})")

                # Wait until midnight
                self._suggestions_wake_event.clear()
                try:
                    await asyncio.wait_for(self._suggestions_wake_event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    log("[DailySuggestionsScheduler] Midnight reached: Triggering new day daily suggestions cycle.")

            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[DailySuggestionsScheduler] Error in suggestions loop: {e}")
                await asyncio.sleep(60.0)

    # ==========================================================================
    # Manual Refresh Trigger
    # ==========================================================================

    async def trigger_refresh(
        self,
        section: str = "all",
        force_regenerate_suggestions: bool = False,
    ) -> Dict[str, Any]:
        """
        Manually triggers refresh for a section:
        - 'weather': cancels any in-progress weather fetch, fetches fresh weather.
        - 'news': cancels any in-progress news fetch, fetches fresh news.
        - 'suggestions': keeps constant data for today (returns same data). If force_regenerate_suggestions
          is True, forces new suggestions.
        - 'all': refreshes weather & news to get new data, preserves constant suggestions for today.
        - 'location_change': cancels any in-progress weather/news and re-runs both for the new location.
        """
        sec = section.lower().strip()
        results: Dict[str, Any] = {}

        if sec == "location_change":
            return await self.handle_location_change()

        tasks = []
        if sec in ("weather", "all"):
            tasks.append(("weather", self.cancel_and_run_weather(force=True)))

        if sec in ("news", "all"):
            tasks.append(("news", self.cancel_and_run_news(force=True)))

        if sec in ("suggestions", "all"):
            tasks.append(("suggestions", self.run_suggestions(force_regenerate=force_regenerate_suggestions)))

        for name, coro in tasks:
            try:
                results[name] = await coro
            except Exception as e:
                results[f"{name}_error"] = str(e)

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
