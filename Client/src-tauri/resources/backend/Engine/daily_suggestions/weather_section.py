from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional

from .vault_client import fetch_latest_daily_suggestions, save_daily_suggestions_data
from .config import DEFAULT_WEATHER_INTERVAL_HOURS
from chat.workflow.weather_tool import get_weather_forecast, get_user_coordinates
from chat.workflow.timezone_helper import resolve_user_timezone
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

    from config import CONFIG
    if CONFIG.has_any_llm_key():
        try:
            raw_summary = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
            if raw_summary and 8 <= len(raw_summary) <= 150 and not raw_summary.startswith("{") and not raw_summary.startswith("NO_LLM_KEYS"):
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


def check_weather_advisory_need(
    structured_data: Dict[str, Any],
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Checks if current or forecasted weather legitimately requires an actionable recommendation / warning.
    Returns (has_advisory, advisory_type, details).
    Types:
      - 'rain': Precipitation, rain volume, rain probability >= 25%, drizzle, thunderstorm, snow.
      - 'heat': Current temp >= 32°C or High >= 34°C, apparent temp >= 34°C.
      - 'cold': Current temp <= 13°C or Low <= 10°C.
      - 'wind': Wind gusts >= 24 km/h.
      - 'none': Mild, calm, clear, or unremarkable weather requiring no special action.
    """
    cur = structured_data.get("current") or {}
    cond = str(cur.get("condition") or "").lower()
    temp = cur.get("temperature_celsius")
    app_temp = cur.get("apparent_temperature_celsius")
    wind = cur.get("wind_speed_kmh") or 0
    rain = cur.get("rain_mm") or 0

    daily = structured_data.get("daily") or []
    today_max = daily[0].get("temp_max_celsius") if daily else temp
    today_min = daily[0].get("temp_min_celsius") if daily else temp
    rain_chance = daily[0].get("precipitation_probability_percent", 0) if daily else 0

    hourly = structured_data.get("hourly_highlights") or []
    cur_time = str(cur.get("time") or "")
    remaining_hours = [h for h in hourly if not cur_time or str(h.get("time") or "") >= cur_time]
    if not remaining_hours:
        remaining_hours = hourly[:8]

    rain_hour = None
    for h in remaining_hours:
        prob = h.get("precipitation_probability_percent", 0)
        rmm = h.get("rain_mm", 0.0)
        c = str(h.get("condition", "")).lower()
        if prob >= 25 or rmm > 0.1 or any(w in c for w in ("rain", "drizzle", "shower", "thunder")):
            rain_hour = h.get("formatted_time", "later today")
            break

    details = {
        "condition": cond,
        "temp": temp,
        "app_temp": app_temp,
        "today_max": today_max,
        "today_min": today_min,
        "rain_chance": rain_chance,
        "rain_mm": rain,
        "wind": wind,
        "rain_hour": rain_hour,
    }

    # 1. Rain / Storm / Snow
    if (rain and rain > 0.1) or (rain_chance and rain_chance >= 25) or rain_hour or any(w in cond for w in ("rain", "drizzle", "shower", "thunder", "storm", "snow")):
        return True, "rain", details

    # 2. Extreme Heat
    if (temp is not None and temp >= 32) or (today_max is not None and today_max >= 34) or (app_temp is not None and app_temp >= 35):
        return True, "heat", details

    # 3. Severe Cold
    if (temp is not None and temp <= 13) or (today_min is not None and today_min <= 10):
        return True, "cold", details

    # 4. Strong Wind
    if wind and wind >= 24:
        return True, "wind", details

    return False, "none", details


def get_time_of_day_context(now_dt: Optional[datetime] = None) -> Tuple[str, str]:
    """
    Returns (time_of_day_name, greeting_time_desc).
    - Morning (05:00 - 11:59)
    - Afternoon (12:00 - 16:59)
    - Evening (17:00 - 20:59)
    - Night (21:00 - 04:59)
    """
    dt = now_dt or datetime.now()
    h = dt.hour
    if 5 <= h < 12:
        return "Morning", "this morning"
    elif 12 <= h < 17:
        return "Afternoon", "this afternoon"
    elif 17 <= h < 21:
        return "Evening", "this evening"
    else:
        return "Night", "tonight"


def generate_weather_funny_suggestion(
    structured_data: Dict[str, Any],
    user_name: str = "User",
    city_name: str = "your city",
    short_summary: str = "",
    now_dt: Optional[datetime] = None,
) -> str:
    """
    Generates actionable, valuable weather recommendations only when needed
    (e.g. rain umbrella timing, heat hydration, cold bundling, wind).
    When no suggestions are needed (calm, mild conditions), explicitly mentions that
    no weather precautions/suggestions are needed, followed by an amusing time-of-day message.
    """
    has_advisory, advisory_type, details = check_weather_advisory_need(structured_data)
    time_of_day, greeting_desc = get_time_of_day_context(now_dt)

    cond = details.get("condition") or "clear"
    temp = details.get("temp")
    app_temp = details.get("app_temp")
    today_max = details.get("today_max")
    today_min = details.get("today_min")
    rain_chance = details.get("rain_chance")
    rain_mm = details.get("rain_mm")
    wind = details.get("wind")
    rain_hour = details.get("rain_hour")

    loc_display = f" in {city_name}" if city_name else ""

    prompt = f"""You are MIRA, a helpful, sharp, and delightfully witty personal AI assistant.
Current weather report for {user_name}{loc_display}:
- Condition: {cond}, Temp: {temp}°C (feels like {app_temp}°C)
- High / Low: High of {today_max}°C, Low of {today_min}°C
- Rain: {rain_mm} mm (Chance: {rain_chance}%, timing: {rain_hour or 'None'})
- Wind: {wind} km/h
- Time of Day: {time_of_day} ({greeting_desc})
- Advisory Status: {'YES - ' + advisory_type.upper() if has_advisory else 'NO ADVISORY NEEDED (calm/mild)'}

Strict Rules:
1. If Advisory Status is YES:
   Provide a genuinely valuable, concise, actionable weather recommendation for {user_name} based on the actual conditions above (e.g. carry an umbrella with expected rain timing, hydrate in heat, bundle up in cold, wind caution). 1 to 2 sentences max.
2. If Advisory Status is NO ADVISORY NEEDED:
   Explicitly state that no weather precautions or suggestions are needed, followed by a witty, amusing, cheerful message tailored to {greeting_desc} for {user_name}. (e.g. "No weather precautions needed this afternoon — skies are calm and drama-free. Keep crushing your code in peace, {user_name}!").
3. Address {user_name} directly in a friendly, conversational tone.
4. Keep it concise (max 32 words, 1-2 sentences).
5. Strictly return ONLY the message text without quotation marks or markdown asterisks."""

    from config import CONFIG
    if CONFIG.has_any_llm_key():
        try:
            raw_suggestion = call_llm(prompt, work="summarization").strip().strip('"').strip("'")
            if raw_suggestion and len(raw_suggestion) > 10 and not raw_suggestion.startswith("{") and not raw_suggestion.startswith("NO_LLM_KEYS"):
                return raw_suggestion
        except Exception as e:
            log_error(f"[WeatherSection] LLM suggestion generation failed: {e}")

    # Deterministic fallback tailored strictly to need and time-of-day
    if has_advisory:
        if advisory_type == "rain":
            timing = f" around {rain_hour}" if rain_hour else ""
            return f"Rain is on the radar{timing}{loc_display} — grab an umbrella so you don't get drenched, {user_name}!"
        elif advisory_type == "heat":
            return f"High of {round(today_max) if today_max is not None else 35}°C today{loc_display} — keep a water bottle handy and stay shaded during peak afternoon heat, {user_name}!"
        elif advisory_type == "cold":
            return f"Temperatures dropping to {round(today_min) if today_min is not None else 10}°C{loc_display} — carry a warm jacket if you're stepping out {greeting_desc}, {user_name}!"
        elif advisory_type == "wind":
            return f"Wind gusts reaching {round(wind)} km/h{loc_display} — hold onto loose items and expect a natural windblown hairstyle, {user_name}!"

    # When NO suggestions are needed: mention it clearly with an amusing time-of-day message
    if time_of_day == "Morning":
        return f"No weather precautions needed this morning{loc_display} — clear and calm skies. Grab your morning coffee and conquer your day without weather drama, {user_name}!"
    elif time_of_day == "Afternoon":
        return f"No weather suggestions needed this afternoon{loc_display} — skies are calm and harmless. Carry on with your afternoon productivity without nature interrupting you, {user_name}."
    elif time_of_day == "Evening":
        return f"No weather warnings to report this evening{loc_display} — serene and pleasant skies all around. Great time to wrap up your day's work and unwind, {user_name}."
    else:
        return f"No weather precautions needed tonight{loc_display} — quiet and peaceful night skies. Rest well and recharge for tomorrow, {user_name}!"


def generate_weather_suggestion(
    structured_data: Dict[str, Any],
    user_name: str = "User",
    city_name: str = "your city",
    rest_of_day: str = "",
    now_dt: Optional[datetime] = None,
) -> str:
    """Wrapper mapping to generate_weather_funny_suggestion for backward compatibility."""
    return generate_weather_funny_suggestion(structured_data, user_name, city_name, rest_of_day, now_dt=now_dt)


async def refresh_weather_forecast(force: bool = False) -> Dict[str, Any]:
    """
    Executes Weather Forecast refresh:
      1. Checks if user location/coordinates are configured. If not, skips immediately.
      2. Checks daily_suggestions table.
      3. If not needed and not forced, returns current data.
      4. Queries existing Weather Forecast Tool.
      5. Generates two versions:
         - Short summary: concise overview of current weather and forecast.
         - Valuable weather recommendation when needed; otherwise mentions no suggestions needed
           with an amusing time-of-day message.
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
    user_tz = resolve_user_timezone(user_profile)
    now_local = datetime.now(user_tz)

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

        # 2. Version B: Actionable advice when needed; otherwise mentions no suggestion needed + time-of-day message
        funny_suggestion = await asyncio.to_thread(
            generate_weather_funny_suggestion,
            structured_data=structured,
            user_name=user_name,
            city_name=loc_name,
            short_summary=short_summary,
            now_dt=now_local,
        )

        has_advisory, advisory_type, _ = check_weather_advisory_need(structured)

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
            "has_advisory": has_advisory,
            "advisory_type": advisory_type,
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
