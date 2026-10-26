from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional

from .vault_client import fetch_latest_daily_suggestions, save_daily_suggestions_data
from .config import DEFAULT_WEATHER_INTERVAL_HOURS
from chat.workflow.weather_tool import get_weather_forecast
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


def generate_rest_of_day_overview(
    structured_data: Dict[str, Any],
    city_name: str = "your area",
) -> str:
    """
    Generates a concise, short rest-of-day weather overview
    (e.g., "Might rain after 2 PM; cooling down to 24°C tonight" or
    "Sunny and hot reaching 33°C at 3 PM, easing to 25°C by 9 PM").
    """
    cur = structured_data.get("current") or {}
    cur_time = str(cur.get("time") or "")
    cur_temp = cur.get("temperature_celsius")
    cur_cond = cur.get("condition", "clear")
    hourly = structured_data.get("hourly_highlights") or []

    # Filter hourly points from current time through end of day
    remaining_hours: List[Dict[str, Any]] = []
    for h in hourly:
        t_iso = str(h.get("time") or "")
        if not cur_time or t_iso >= cur_time:
            remaining_hours.append(h)

    if not remaining_hours:
        remaining_hours = hourly[:8]

    # Analyze rain / precipitation timing
    rain_hour: Optional[str] = None
    rain_prob = 0
    for h in remaining_hours:
        prob = h.get("precipitation_probability_percent", 0)
        rain_mm = h.get("rain_mm", 0.0)
        cond_str = str(h.get("condition", "")).lower()
        if prob >= 25 or rain_mm > 0.1 or "rain" in cond_str or "drizzle" in cond_str or "shower" in cond_str:
            rain_hour = h.get("formatted_time", "later")
            rain_prob = prob
            break

    # Analyze peak temp and night temp
    peak_temp = cur_temp
    peak_hour = "midday"
    night_temp = cur_temp
    for idx, h in enumerate(remaining_hours):
        t = h.get("temperature_celsius")
        if t is not None:
            if peak_temp is None or t > peak_temp:
                peak_temp = t
                peak_hour = h.get("formatted_time", "afternoon")
            if idx == len(remaining_hours) - 1 or "09:00 PM" in h.get("formatted_time", "") or "10:00 PM" in h.get("formatted_time", ""):
                night_temp = t

    # Format hourly summary for LLM
    hourly_lines = [
        f"{h.get('formatted_time', h.get('time'))}: {h.get('temperature_celsius')}°C, {h.get('condition')} (rain chance: {h.get('precipitation_probability_percent', 0)}%)"
        for h in remaining_hours[:8]
    ]
    hourly_text = "; ".join(hourly_lines)

    prompt = f"""You are MIRA, an intelligent personal assistant.
Provide a very short rest-of-day weather overview for {city_name}.
Current condition: {cur_cond}, {cur_temp}°C (Local time: {cur_time})
Hourly outlook for remaining hours today:
{hourly_text}

Rules:
1. Summarize the rest of today in ONE short, natural sentence (max 15 words).
2. If rain or precipitation is likely, explicitly state the timing (e.g. "Might rain after 2 PM; cooling to 23°C tonight" or "Chance of rain around 4 PM, clearing by evening").
3. If no rain, mention peak temperature timing and evening outlook (e.g. "Clear and sunny reaching 33°C around 3 PM, easing to 25°C tonight").
4. Strictly return only the sentence without quotation marks, bullet points, or markdown asterisks."""

    try:
        raw_overview = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
        if raw_overview and 8 <= len(raw_overview) <= 120 and not raw_overview.startswith("{"):
            return raw_overview
    except Exception as e:
        log_error(f"[WeatherSection] LLM rest-of-day overview generation failed: {e}")

    # Deterministic heuristic fallback
    peak_display = f"{round(peak_temp)}°C" if peak_temp is not None else "warm"
    night_display = f"{round(night_temp)}°C" if night_temp is not None else "cooler"
    if rain_hour:
        prob_str = f" ({rain_prob}% chance)" if rain_prob else ""
        return f"Might rain around {rain_hour}{prob_str}; cooling down to {night_display} tonight."
    elif peak_temp is not None and cur_temp is not None and peak_temp > cur_temp + 1.5:
        return f"Mainly {cur_cond.lower()} reaching {peak_display} around {peak_hour}, cooling to {night_display} tonight."
    else:
        return f"Pleasant and {cur_cond.lower()} through the evening, dipping to {night_display} tonight."


def generate_weather_suggestion(
    structured_data: Dict[str, Any],
    user_name: str = "User",
    city_name: str = "your city",
    rest_of_day: str = "",
) -> str:
    """
    Generates practical, valuable, and actionable weather guidance
    covering clothing, UV protection, hydration, and optimal outdoor errand windows.
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

    prompt = f"""You are MIRA, a thoughtful and highly intelligent personal AI assistant.
Current weather report for {user_name} in {city_name}:
- Condition: {condition}
- Current Temp: {temp}°C (feels like {app_temp}°C)
- High / Low: High of {today_max}°C, Low of {today_min}°C
- Rain chance: {rain_chance}% (rain volume: {rain} mm)
- Wind: {wind} km/h, Humidity: {humidity}%
- Rest of Day Outlook: {rest_of_day or 'Steady'}

Task:
Provide valuable, practical, and actionable weather advice for {user_name} (1 to 2 sentences max).
Focus on useful guidance such as:
- Apparel and clothing advice (e.g. breathable cotton fabrics, light layers, waterproof gear, sunglasses).
- Health & comfort (e.g. UV sun protection, hydration, avoiding peak midday heat).
- Optimal windows for outdoor activities, commuting, or errands.

Strict rules:
1. Make it genuinely helpful and valuable — do NOT write generic jokes, silly puns, or sarcastic humor.
2. Address {user_name} directly in a warm, professional, and observant tone.
3. Keep it under 2 sentences (max 40 words).
4. Strictly return ONLY the advice text. Do NOT use quotation marks, pleasantry headers, or markdown asterisks."""

    try:
        raw_suggestion = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
        if raw_suggestion and len(raw_suggestion) > 10 and not raw_suggestion.startswith("{"):
            return raw_suggestion
    except Exception as e:
        log_error(f"[WeatherSection] LLM suggestion generation failed: {e}")

    # Practical and valuable deterministic fallbacks
    if rain and rain > 0 or (rain_chance and rain_chance >= 40) or "rain" in str(condition).lower():
        return f"Keep an umbrella handy today and consider waterproof footwear, as wet conditions may affect your evening commute."
    elif temp is not None and temp >= 32:
        return f"With temperatures climbing above {round(temp)}°C, wear breathable fabrics, stay well-hydrated, and schedule outdoor errands for the late afternoon."
    elif temp is not None and temp <= 14:
        return f"It is brisk outside at {round(temp)}°C — layer up with a warm jacket and keep a thermal layer handy for when temperatures drop this evening."
    elif wind and wind >= 25:
        return f"Expect gusty winds up to {round(wind)} km/h today; secure loose outdoor items and keep a windbreaker close by if heading out."
    else:
        return f"Conditions are comfortable at {round(temp) if temp is not None else 24}°C — late afternoon will be an ideal window for outdoor walks or errands."


async def refresh_weather_forecast(force: bool = False) -> Dict[str, Any]:
    """
    Executes Weather Forecast refresh:
      1. Checks daily_suggestions table.
      2. If not needed and not forced, returns current data.
      3. Retrieves location from Vault.
      4. Queries existing Weather Forecast Tool.
      5. Generates concise rest-of-day overview and valuable practical suggestion.
      6. Stores forecast & suggestion in weather, updating date_weather.
      7. Broadcasts update over WebSocket.
    """
    current_record = await asyncio.to_thread(fetch_latest_daily_suggestions)
    if not force and not is_weather_refresh_needed(current_record):
        log("[WeatherSection] Weather forecast is already up-to-date. Skipping refresh.")
        return current_record.get("weather") or {}

    log("[WeatherSection] Initiating weather forecast refresh...")

    # Broadcast refreshing indicator
    try:
        await ws_manager.broadcast_daily_suggestions_update("weather", {"status": "refreshing"})
    except Exception:
        pass

    user_profile = await asyncio.to_thread(get_user_profile) or {}
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

        # Generate concise rest-of-day overview
        rest_of_day = await asyncio.to_thread(
            generate_rest_of_day_overview,
            structured_data=structured,
            city_name=loc_name,
        )

        # Generate valuable, practical suggestion
        suggestion = await asyncio.to_thread(
            generate_weather_suggestion,
            structured_data=structured,
            user_name=user_name,
            city_name=loc_name,
            rest_of_day=rest_of_day,
        )

        weather_payload: Dict[str, Any] = {
            "status": "success",
            "location": structured.get("location"),
            "current": structured.get("current"),
            "daily": structured.get("daily"),
            "hourly": structured.get("hourly_highlights", [])[:12],
            "rest_of_day": rest_of_day,
            "suggestion": suggestion,
            "summary_text": forecast_result.get("summary_text"),
            "updated_at": now_iso,
        }
    else:
        # Fallback or missing location state
        msg = forecast_result.get("message") or "Weather forecast unavailable."
        weather_payload = {
            "status": forecast_result.get("status", "error"),
            "message": msg,
            "rest_of_day": "Forecast details currently unavailable.",
            "suggestion": "Configure your city and country in Settings so MIRA can give you localized weather and daily recommendations.",
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
