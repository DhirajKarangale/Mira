from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional

from .vault_client import fetch_latest_daily_suggestions, save_daily_suggestions_data
from .config import DEFAULT_WEATHER_INTERVAL_HOURS
from chat.workflow.weather_tool import get_weather_forecast, get_user_coordinates
from chat.websocket import ws_manager
from config import get_user_profile
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.daily_suggestions.weather_section")


def parse_timestamp(ts: Any) -> Optional[datetime]:
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts
    s = str(ts).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return None


def is_weather_refresh_needed(
    record: Optional[Dict[str, Any]],
    interval_hours: float = DEFAULT_WEATHER_INTERVAL_HOURS,
) -> bool:
    if not record:
        return True
    weather_data = record.get("weather")
    date_weather = record.get("date_weather")
    if not weather_data or weather_data == {} or weather_data == "{}":
        return True
    if not date_weather:
        return True
    dt = parse_timestamp(date_weather)
    if not dt:
        return True
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta_seconds = (now - dt).total_seconds()
    return delta_seconds >= (interval_hours * 3600)


def generate_weather_short_summary(
    structured_data: Dict[str, Any],
    city_name: str = "your area",
) -> str:
    """
    Generates a concise, factually accurate short summary of the current weather and forecast.
    (e.g., "Mainly clear and 33°C in Shegaon with highs near 34°C, cooling to 25°C tonight; zero rain expected.")
    """
    cur = structured_data.get("current") or {}
    cur_time = str(cur.get("time") or "")
    cur_temp = cur.get("temperature_celsius")
    cur_cond = cur.get("condition", "clear")
    daily = structured_data.get("daily") or []
    today_max = daily[0].get("temp_max_celsius") if daily else cur_temp
    today_min = daily[0].get("temp_min_celsius") if daily else cur_temp
    rain_chance = daily[0].get("precipitation_probability_percent", 0) if daily else 0
    rain_mm = daily[0].get("rain_sum_mm", 0.0) if daily else 0.0

    hourly = structured_data.get("hourly_highlights") or []
    remaining_hours = [h for h in hourly if not cur_time or str(h.get("time") or "") >= cur_time]
    if not remaining_hours:
        remaining_hours = hourly[:8]

    # Check rain timing
    rain_hour = None
    for h in remaining_hours:
        prob = h.get("precipitation_probability_percent", 0)
        rmm = h.get("rain_mm", 0.0)
        c = str(h.get("condition", "")).lower()
        if prob >= 25 or rmm > 0.1 or "rain" in c or "drizzle" in c or "shower" in c:
            rain_hour = h.get("formatted_time", "later")
            break

    night_temp = remaining_hours[-1].get("temperature_celsius") if remaining_hours else cur_temp

    prompt = f"""You are MIRA, a sharp personal AI assistant.
Current weather report for {city_name}:
- Condition: {cur_cond}, Current Temp: {cur_temp}°C
- Today's High: {today_max}°C, Low: {today_min}°C
- Rain Chance: {rain_chance}% (Rain volume: {rain_mm} mm)
- Rain timing (if any): {rain_hour or 'No rain forecasted'}
- Tonight's expected temp: ~{night_temp}°C

Task:
Generate a concise, strictly factually accurate short summary of the current weather and forecast for {city_name} (1 to 2 short sentences, max 22 words).
State current conditions, high/low, rain expectations, and evening trend.
No conversational fluff, no quotation marks, no markdown asterisks."""

    try:
        raw_summary = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
        if raw_summary and 8 <= len(raw_summary) <= 150 and not raw_summary.startswith("{"):
            return raw_summary
    except Exception as e:
        log_error(f"[WeatherSection] LLM short summary generation failed: {e}")

    # Deterministic factual fallback
    rain_text = f"rain possible around {rain_hour}" if rain_hour else "zero rain expected"
    return f"{cur_cond} and {round(cur_temp) if cur_temp is not None else '--'}°C in {city_name} with highs near {round(today_max) if today_max is not None else '--'}°C; {rain_text}, cooling to {round(night_temp) if night_temp is not None else '--'}°C tonight."


def generate_rest_of_day_overview(
    structured_data: Dict[str, Any],
    city_name: str = "your area",
) -> str:
    """Wrapper mapping to generate_weather_short_summary for backward compatibility."""
    return generate_weather_short_summary(structured_data, city_name)


def generate_weather_funny_suggestion(
    structured_data: Dict[str, Any],
    user_name: str = "User",
    city_name: str = "your city",
    short_summary: str = "",
) -> str:
    """
    Generates a playful, humorous, descriptive recommendation based on actual weather conditions
    (e.g., carrying an umbrella when rain is expected, not melting into a puddle in the heat, etc.).
    """
    cur = structured_data.get("current") or {}
    condition = cur.get("condition", "clear")
    temp = cur.get("temperature_celsius")
    app_temp = cur.get("apparent_temperature_celsius")
    humidity = cur.get("relative_humidity_percent")
    rain = cur.get("rain_mm", 0)
    wind = cur.get("wind_speed_kmh", 0)

    daily = structured_data.get("daily") or []
    today_max = daily[0].get("temp_max_celsius") if daily else temp
    today_min = daily[0].get("temp_min_celsius") if daily else temp
    rain_chance = daily[0].get("precipitation_probability_percent") if daily else 0

    prompt = f"""You are MIRA, a witty, observant, and delightfully funny personal AI assistant.
Current weather report for {user_name} in {city_name}:
- Condition: {condition}
- Current Temp: {temp}°C (feels like {app_temp}°C)
- High / Low: High of {today_max}°C, Low of {today_min}°C
- Rain chance: {rain_chance}% (rain volume: {rain} mm)
- Wind: {wind} km/h, Humidity: {humidity}%
- Forecast Overview: {short_summary or 'Standard'}

Task:
Write a playful, humorous, descriptive recommendation for {user_name} based on the actual weather above (1 to 2 sentences max).
Playful requirements:
- Rain / Drizzle: Recommend carrying an umbrella unless they want an impromptu outdoor shower or are practicing their backstroke.
- Heat / Sun: Remind them to hydrate aggressively, seek shade, and avoid melting into a human puddle under the scorching sun.
- Cold / Chilly: Suggest bundling up like a cozy burrito and guarding their toes against the brisk chill.
- Wind: Warn them that the wind is eager to redesign their hairstyle today.
- Pleasant / Mild: Give a cheerful nudge to escape the screen and soak in some fresh air before the weather changes its mind.

Strict rules:
1. Make it genuinely funny, witty, and descriptive, while remaining factually accurate to the actual weather above.
2. Address {user_name} directly in a playful, cheerful, slightly cheeky tone.
3. Keep it under 2 sentences (max 35 words).
4. Strictly return ONLY the recommendation text. Do NOT use quotation marks, pleasantry headers, or markdown asterisks."""

    try:
        raw_suggestion = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
        if raw_suggestion and len(raw_suggestion) > 10 and not raw_suggestion.startswith("{"):
            return raw_suggestion
    except Exception as e:
        log_error(f"[WeatherSection] LLM funny suggestion generation failed: {e}")

    # Deterministic funny fallback grounded in real weather data
    loc_display = f" in {city_name}" if city_name else ""
    if rain and rain > 0 or (rain_chance and rain_chance >= 35) or "rain" in str(condition).lower():
        return f"Clouds are actively plotting against your dry clothes today{loc_display} — grab an umbrella unless your afternoon plans include swimming, {user_name}!"
    elif temp is not None and temp >= 31:
        return f"The sun is treating the outdoors like a giant frying pan today at {round(temp)}°C{loc_display} — hydrate aggressively and don't turn into a human puddle, {user_name}!"
    elif temp is not None and temp <= 13:
        return f"It's brisk enough outside{loc_display} at {round(temp)}°C to freeze your good mood — wrap up like a cozy burrito before stepping out, {user_name}!"
    elif wind and wind >= 24:
        return f"Hold onto your hat{loc_display}! Today's {round(wind)} km/h wind gusts will gladly redesign your hairstyle for free."
    else:
        return f"Pleasant skies ahead{loc_display} at {round(temp) if temp is not None else 25}°C — perfect excuse to escape the screen for ten minutes, {user_name}!"


def generate_weather_suggestion(
    structured_data: Dict[str, Any],
    user_name: str = "User",
    city_name: str = "your city",
    rest_of_day: str = "",
) -> str:
    """Wrapper mapping to generate_weather_funny_suggestion for backward compatibility."""
    return generate_weather_funny_suggestion(structured_data, user_name, city_name, rest_of_day)


async def refresh_weather_forecast(force: bool = False) -> Dict[str, Any]:
    """
    Executes Weather Forecast refresh:
      1. Checks if user location/coordinates are configured. If not, skips immediately.
      2. Checks daily_suggestions table.
      3. If not needed and not forced, returns current data.
      4. Queries existing Weather Forecast Tool.
      5. Generates two versions:
         - Short summary: concise overview of current weather and forecast.
         - Funny descriptive suggestion: playful recommendation based on actual weather.
      6. Stores forecast & suggestions in weather, updating date_weather.
      7. Broadcasts update over WebSocket.
    """
    # 1. Check whether user location is configured before making any calls
    user_profile = await asyncio.to_thread(get_user_profile, force_refresh=True) or {}
    lat, lon, _ = get_user_coordinates(user_profile)
    if lat is None or lon is None:
        log("[WeatherSection] User location/coordinates are not configured. Skipping weather forecast refresh.")
        return {}

    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)
    if not force and not is_weather_refresh_needed(current_record):
        log("[WeatherSection] Weather forecast is already up-to-date. Skipping refresh.")
        return current_record.get("weather") or {} if current_record else {}

    log("[WeatherSection] Initiating weather forecast refresh...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("weather", {"status": "refreshing"})
    except Exception:
        pass

    user_name = user_profile.get("user_name") or "User"
    city = user_profile.get("city") or ""

    # Call existing Weather Forecast Tool
    forecast_result = await asyncio.to_thread(
        get_weather_forecast,
        forecast_days=7,
        user_profile=user_profile,
    )

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if forecast_result.get("status") == "success" and forecast_result.get("structured_data"):
        structured = forecast_result["structured_data"]
        loc_name = structured.get("location", {}).get("name") or city or "Your Location"

        # 1. Version A: Concise short summary of current weather and forecast
        short_summary = await asyncio.to_thread(
            generate_weather_short_summary,
            structured_data=structured,
            city_name=loc_name,
        )

        # 2. Version B: Playful, humorous descriptive recommendation based on actual weather
        funny_suggestion = await asyncio.to_thread(
            generate_weather_funny_suggestion,
            structured_data=structured,
            user_name=user_name,
            city_name=loc_name,
            short_summary=short_summary,
        )

        weather_payload: Dict[str, Any] = {
            "status": "success",
            "location": structured.get("location"),
            "current": structured.get("current"),
            "daily": structured.get("daily"),
            "hourly": structured.get("hourly_highlights", []),
            "short_summary": short_summary,
            "rest_of_day": short_summary,
            "funny_suggestion": funny_suggestion,
            "suggestion": funny_suggestion,
            "summary_text": forecast_result.get("summary_text"),
            "updated_at": now_iso,
        }
    else:
        # Fallback or missing location state
        msg = forecast_result.get("message") or "Weather forecast unavailable."
        fallback_summary = "Forecast details currently unavailable."
        fallback_suggestion = "Configure your city and country in Settings so MIRA can give you localized weather and daily recommendations!"
        weather_payload = {
            "status": forecast_result.get("status", "error"),
            "message": msg,
            "short_summary": fallback_summary,
            "rest_of_day": fallback_summary,
            "funny_suggestion": fallback_suggestion,
            "suggestion": fallback_suggestion,
            "updated_at": now_iso,
        }

    # Store in Vault
    saved_record = await asyncio.to_thread(
        save_daily_suggestions_data,
        {
            "weather": weather_payload,
            "date_weather": now_iso,
        }
    )

    log(f"[WeatherSection] Weather forecast refreshed and persisted. Status: {weather_payload.get('status')}")

    # Broadcast fresh data over WebSocket
    try:
        await ws_manager.broadcast_daily_suggestions_update(
            "weather",
            {
                "status": "ready",
                "weather": weather_payload,
                "date_weather": now_iso,
                "record_id": saved_record.get("id"),
            }
        )
    except Exception as e:
        log_error(f"[WeatherSection] Failed to broadcast weather update via WebSocket: {e}")

    return weather_payload
