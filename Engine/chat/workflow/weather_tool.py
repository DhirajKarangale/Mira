from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import requests

from .state import AgentState
from vault_logger import log, log_error
from config import get_user_profile

logger = logging.getLogger("mira.engine.chat.workflow.weather_tool")

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MIN_FORECAST_DAYS = 1
MAX_FORECAST_DAYS = 16
DEFAULT_FORECAST_DAYS = 7

# WMO Weather interpretation codes (WW)
# https://open-meteo.com/en/docs
WMO_WEATHER_CODES: Dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_weather_description(code: Optional[int]) -> str:
    """Translates WMO weather code to human-readable condition text."""
    if code is None:
        return "Unknown"
    return WMO_WEATHER_CODES.get(int(code), f"Weather code {code}")


def validate_forecast_days(days: Any, default: int = DEFAULT_FORECAST_DAYS) -> int:
    """
    Validates and clamps requested forecast days to Open-Meteo's supported range (1 to 16 days).
    """
    if days is None:
        return default
    try:
        val = int(days)
        return max(MIN_FORECAST_DAYS, min(val, MAX_FORECAST_DAYS))
    except (ValueError, TypeError):
        return default


def parse_forecast_days_from_query(query: str, default: int = DEFAULT_FORECAST_DAYS) -> int:
    """
    Infers the requested number of forecast days from natural language user query.
    Examples:
      - 'weather today' / 'current weather' -> 1
      - 'tomorrow' -> 2
      - 'next 3 days' / '3 day forecast' -> 3
      - 'this week' / 'weekly forecast' -> 7
    """
    q = (query or "").lower().strip()
    if not q:
        return default

    # Explicit numbers: "3 days", "next 5 days", "10-day forecast", "forecast for 4 days"
    match = re.search(r'\b(?:next\s+|for\s+)?(\d{1,2})\s*(?:-|\s*)days?\b', q)
    if match:
        try:
            return validate_forecast_days(int(match.group(1)), default)
        except (ValueError, TypeError):
            pass

    # "tomorrow" indicates looking ahead 2 days
    if "tomorrow" in q:
        return 2

    # "week" / "weekend" indicates 7-day outlook
    if "week" in q or "weekend" in q:
        return 7

    # "today", "current", "now", "tonight", "right now", "currently"
    single_day_terms = ("today", "current", "currently", "now", "right now", "tonight", "this morning", "this afternoon", "this evening")
    if any(term in q for term in single_day_terms):
        return 1

    return default


def get_user_coordinates(user_profile: Optional[Dict[str, Any]] = None) -> Tuple[Optional[float], Optional[float], Dict[str, Any]]:
    """
    Retrieves user latitude and longitude from the user table in Vault using existing
    data access mechanisms:
      1. Provided user_profile dict (if latitude/longitude present)
      2. Engine config.get_user_profile() (which loads from Vault /user or config_storage)
    Returns: (latitude, longitude, profile_dict)
    """
    profile = dict(user_profile or {})

    # If profile is empty, retrieve active profile from Engine config / Vault
    if not profile:
        try:
            fresh_profile = get_user_profile()
            if fresh_profile:
                profile.update(fresh_profile)
        except Exception as e:
            log_error(f"[WeatherTool] Error fetching user profile from Vault: {e}")

    lat = profile.get("latitude")
    lon = profile.get("longitude")

    # If still not found and profile is empty, fallback to direct Vault config_storage
    if (lat is None or lon is None) and not profile:
        try:
            import sys
            from pathlib import Path
            vault_dir = Path(__file__).resolve().parent.parent.parent.parent / "Vault"
            if str(vault_dir) not in sys.path:
                sys.path.append(str(vault_dir))
            import config_storage
            config_storage.init_config_storage()
            u_cfg = config_storage.get_configuration("user_details")
            if isinstance(u_cfg, dict):
                profile.update(u_cfg)
                lat = profile.get("latitude")
                lon = profile.get("longitude")
        except Exception as e:
            logger.debug(f"Direct Vault config_storage location lookup failed: {e}")

    # Validate coordinate values
    try:
        lat_float = float(lat) if lat is not None and lat != "" else None
        lon_float = float(lon) if lon is not None and lon != "" else None
        if lat_float is not None and lon_float is not None:
            if -90.0 <= lat_float <= 90.0 and -180.0 <= lon_float <= 180.0:
                return lat_float, lon_float, profile
    except (ValueError, TypeError):
        pass

    return None, None, profile


def fetch_open_meteo_forecast(
    latitude: float,
    longitude: float,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
    timezone: str = "auto",
) -> Dict[str, Any]:
    """
    Calls Open-Meteo Forecast API:
      https://api.open-meteo.com/v1/forecast
    Dynamically provides coordinates, forecast duration (1-16), and timezone=auto.
    Retrieves current weather, hourly forecasts, and daily forecasts.
    """
    clamped_days = validate_forecast_days(forecast_days)
    params = {
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m",
        "hourly": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,snowfall,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,snowfall_sum,precipitation_probability_max,wind_speed_10m_max",
        "forecast_days": clamped_days,
        "timezone": timezone or "auto",
    }

    log(f"[WeatherTool] Querying Open-Meteo API: lat={params['latitude']}, lon={params['longitude']}, days={clamped_days}, tz={params['timezone']}")

    max_attempts = 2
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(OPEN_METEO_FORECAST_URL, params=params, timeout=5.0)
            if response.status_code == 200:
                return response.json()
            if response.status_code in (429, 503) and attempt < max_attempts:
                import time
                time.sleep(0.5)
                continue
            log_error(f"[WeatherTool] Open-Meteo API HTTP error {response.status_code}: {response.text}")
            return {
                "error": True,
                "status_code": response.status_code,
                "message": f"Open-Meteo API returned status code {response.status_code}",
            }
        except requests.exceptions.Timeout:
            if attempt < max_attempts:
                import time
                time.sleep(0.5)
                continue
            log_error("[WeatherTool] Open-Meteo API connection timed out.")
            return {
                "error": True,
                "status_code": 408,
                "message": "Weather forecast service request timed out.",
            }
        except Exception as e:
            log_error(f"[WeatherTool] Open-Meteo API request exception: {e}")
            return {
                "error": True,
                "status_code": 500,
                "message": f"Failed to retrieve weather data: {str(e)}",
            }


def format_weather_report(
    api_data: Dict[str, Any],
    user_profile: Dict[str, Any],
    requested_days: int,
) -> Tuple[Dict[str, Any], str]:
    """
    Transforms raw Open-Meteo forecast API response into:
      1. Structured data dictionary (suitable for programmatic/agentic consumption)
      2. Natural, structured text summary (current weather, daily forecasts, hourly highlights)
         optimized for LLM response synthesis without unnecessary noise.
    """
    loc_parts = [
        user_profile.get("city"),
        user_profile.get("state"),
        user_profile.get("country"),
    ]
    location_name = ", ".join([str(p).strip() for p in loc_parts if p and str(p).strip()])
    lat = api_data.get("latitude")
    lon = api_data.get("longitude")
    tz = api_data.get("timezone", "auto")
    elevation = api_data.get("elevation")

    loc_header = location_name if location_name else f"Coordinates ({lat}°N, {lon}°E)"

    # 1. Current Weather
    current_raw = api_data.get("current") or {}
    cur_temp = current_raw.get("temperature_2m")
    cur_app_temp = current_raw.get("apparent_temperature")
    cur_humidity = current_raw.get("relative_humidity_2m")
    cur_wind = current_raw.get("wind_speed_10m")
    cur_rain = current_raw.get("rain")
    cur_snow = current_raw.get("snowfall")
    cur_precip = current_raw.get("precipitation")
    cur_code = current_raw.get("weather_code")
    cur_condition = get_weather_description(cur_code)
    cur_time = current_raw.get("time", "")

    current_structured = {
        "time": cur_time,
        "temperature_celsius": cur_temp,
        "apparent_temperature_celsius": cur_app_temp,
        "relative_humidity_percent": cur_humidity,
        "wind_speed_kmh": cur_wind,
        "precipitation_mm": cur_precip,
        "rain_mm": cur_rain,
        "snowfall_cm": cur_snow,
        "weather_code": cur_code,
        "condition": cur_condition,
    }

    # 2. Daily Forecasts
    daily_raw = api_data.get("daily") or {}
    dates = daily_raw.get("time") or []
    codes = daily_raw.get("weather_code") or []
    max_temps = daily_raw.get("temperature_2m_max") or []
    min_temps = daily_raw.get("temperature_2m_min") or []
    app_max_temps = daily_raw.get("apparent_temperature_max") or []
    app_min_temps = daily_raw.get("apparent_temperature_min") or []
    precip_sums = daily_raw.get("precipitation_sum") or []
    rain_sums = daily_raw.get("rain_sum") or []
    snow_sums = daily_raw.get("snowfall_sum") or []
    precip_probs = daily_raw.get("precipitation_probability_max") or []
    wind_maxes = daily_raw.get("wind_speed_10m_max") or []

    daily_structured: List[Dict[str, Any]] = []
    daily_lines: List[str] = []

    for i in range(min(len(dates), requested_days)):
        d_str = dates[i]
        code = codes[i] if i < len(codes) else None
        cond = get_weather_description(code)
        t_max = max_temps[i] if i < len(max_temps) else None
        t_min = min_temps[i] if i < len(min_temps) else None
        app_max = app_max_temps[i] if i < len(app_max_temps) else None
        app_min = app_min_temps[i] if i < len(app_min_temps) else None
        p_prob = precip_probs[i] if i < len(precip_probs) else 0
        r_sum = rain_sums[i] if i < len(rain_sums) else 0.0
        s_sum = snow_sums[i] if i < len(snow_sums) else 0.0
        w_max = wind_maxes[i] if i < len(wind_maxes) else 0.0

        try:
            dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
            day_label = dt_obj.strftime("%A, %b %d")
        except Exception:
            day_label = d_str

        daily_structured.append({
            "date": d_str,
            "day": day_label,
            "condition": cond,
            "weather_code": code,
            "temp_max_celsius": t_max,
            "temp_min_celsius": t_min,
            "apparent_temp_max_celsius": app_max,
            "apparent_temp_min_celsius": app_min,
            "precipitation_probability_percent": p_prob,
            "rain_sum_mm": r_sum,
            "snowfall_sum_cm": s_sum,
            "wind_speed_max_kmh": w_max,
        })

        daily_lines.append(
            f"- **{day_label}**: {cond}. High: {t_max}°C, Low: {t_min}°C "
            f"(Feels like {app_min}°C to {app_max}°C). "
            f"Precipitation chance: {p_prob}%, Rain: {r_sum} mm, Wind up to {w_max} km/h."
        )

    # 3. Hourly Forecast Highlights (sample key hours or hours with precipitation over the next 24 hours)
    hourly_raw = api_data.get("hourly") or {}
    h_times = hourly_raw.get("time") or []
    h_temps = hourly_raw.get("temperature_2m") or []
    h_app_temps = hourly_raw.get("apparent_temperature") or []
    h_humidities = hourly_raw.get("relative_humidity_2m") or []
    h_probs = hourly_raw.get("precipitation_probability") or []
    h_rains = hourly_raw.get("rain") or []
    h_snows = hourly_raw.get("snowfall") or []
    h_codes = hourly_raw.get("weather_code") or []
    h_winds = hourly_raw.get("wind_speed_10m") or []

    hourly_structured: List[Dict[str, Any]] = []
    hourly_lines: List[str] = []

    # Take up to 48 hourly points so full day and upcoming hours are preserved
    limit_hours = min(len(h_times), 48)
    for idx in range(limit_hours):
        t_iso = h_times[idx]
        temp = h_temps[idx] if idx < len(h_temps) else None
        app_temp = h_app_temps[idx] if idx < len(h_app_temps) else None
        humidity = h_humidities[idx] if idx < len(h_humidities) else None
        prob = h_probs[idx] if idx < len(h_probs) else 0
        rain = h_rains[idx] if idx < len(h_rains) else 0.0
        snow = h_snows[idx] if idx < len(h_snows) else 0.0
        code = h_codes[idx] if idx < len(h_codes) else None
        wind = h_winds[idx] if idx < len(h_winds) else 0.0
        cond = get_weather_description(code)

        try:
            hour_dt = datetime.strptime(t_iso, "%Y-%m-%dT%H:%M")
            hour_str = hour_dt.strftime("%I:%M %p")
        except Exception:
            hour_str = t_iso

        item = {
            "time": t_iso,
            "formatted_time": hour_str,
            "temperature_celsius": temp,
            "apparent_temperature_celsius": app_temp,
            "relative_humidity_percent": humidity,
            "precipitation_probability_percent": prob,
            "rain_mm": rain,
            "snowfall_cm": snow,
            "condition": cond,
            "wind_speed_kmh": wind,
        }
        hourly_structured.append(item)

        # Include in summary text if interval step (every 3 hours) or significant precipitation
        if idx % 3 == 0 or (prob and prob >= 30) or (rain and rain > 0.0) or (snow and snow > 0.0):
            rain_note = f", Rain: {rain} mm ({prob}%)" if (rain or prob) else ""
            hourly_lines.append(f"  * {hour_str}: {temp}°C (feels {app_temp}°C), {cond}{rain_note}, wind {wind} km/h")

    # Complete structured payload
    structured_data = {
        "location": {
            "name": location_name or "User Location",
            "latitude": lat,
            "longitude": lon,
            "timezone": tz,
            "elevation": elevation,
        },
        "forecast_days": requested_days,
        "current": current_structured,
        "daily": daily_structured,
        "hourly_highlights": hourly_structured,
    }

    # Clean textual summary for synthesis
    text_sections = [
        f"**Weather Forecast for {loc_header}** (Coordinates: {lat}°N, {lon}°E, Timezone: {tz}):",
        f"- **Current Weather** ({cur_time}): {cur_condition}, {cur_temp}°C (Feels like {cur_app_temp}°C), "
        f"Humidity: {cur_humidity}%, Wind: {cur_wind} km/h, Precipitation: {cur_precip} mm.",
        f"\n**Daily Forecast ({requested_days} day{'s' if requested_days > 1 else ''}):**",
        "\n".join(daily_lines),
    ]

    if hourly_lines:
        text_sections.extend([
            "\n**Upcoming Hourly Outlook (Next 24 Hours):**",
            "\n".join(hourly_lines),
        ])

    summary_text = "\n".join(text_sections)
    return structured_data, summary_text


def get_weather_forecast(
    forecast_days: int = DEFAULT_FORECAST_DAYS,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Main Weather Tool function:
    1. Validates requested number of forecast days (clamps to 1-16).
    2. Dynamically retrieves user latitude and longitude from Vault user table if not provided.
    3. Calls Open-Meteo Forecast API with coordinates, duration, and timezone=auto.
    4. Returns structured weather data and human-readable summary.
    """
    clamped_days = validate_forecast_days(forecast_days)

    # Retrieve coordinates from Vault if not explicitly supplied
    lat = latitude
    lon = longitude
    prof = dict(user_profile or {})

    if lat is None or lon is None:
        lat, lon, prof = get_user_coordinates(prof)

    if lat is None or lon is None:
        user_name = prof.get("user_name", "there")
        city_hint = prof.get("city")
        loc_str = f" for '{city_hint}'" if city_hint else ""
        msg = (
            f"Location coordinates (latitude and longitude) are not configured in your profile{loc_str}. "
            "Please update your location details in Settings / User Details so MIRA can fetch accurate weather forecasts."
        )
        log_error(f"[WeatherTool] Missing location coordinates in Vault for user '{user_name}'")
        return {
            "status": "missing_location",
            "message": msg,
            "structured_data": None,
            "summary_text": msg,
        }

    # Query Open-Meteo API
    raw_api = fetch_open_meteo_forecast(
        latitude=lat,
        longitude=lon,
        forecast_days=clamped_days,
        timezone="auto",
    )

    if raw_api.get("error"):
        error_msg = raw_api.get("message", "Unable to retrieve weather forecast from Open-Meteo.")
        return {
            "status": "api_error",
            "message": error_msg,
            "structured_data": None,
            "summary_text": f"Weather forecast could not be retrieved at this time: {error_msg}",
        }

    structured, text = format_weather_report(raw_api, prof, clamped_days)

    return {
        "status": "success",
        "structured_data": structured,
        "summary_text": text,
        "forecast_days": clamped_days,
    }


def weather_forecast_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 3 (Tool Node): Dynamic Weather Forecast LangGraph Node.
    Invoked when Decision Node routes to 'weather'.
    Extracts requested forecast days from state parameters or user query,
    fetches forecast via get_weather_forecast, and populates state.
    """
    user_query = state.get("user_query", "").strip()
    tool_params = state.get("tool_parameters") or {}
    user_profile = state.get("user_profile") or {}

    # Extract or infer requested forecast days
    requested_days = tool_params.get("forecast_days")
    if requested_days is None:
        requested_days = parse_forecast_days_from_query(user_query, DEFAULT_FORECAST_DAYS)
    else:
        requested_days = validate_forecast_days(requested_days, DEFAULT_FORECAST_DAYS)

    log(f"[WeatherForecastNode] Executing weather tool: query='{user_query}', days={requested_days}")

    result = get_weather_forecast(
        forecast_days=requested_days,
        user_profile=user_profile,
    )

    summary_text = result.get("summary_text") or result.get("message") or "No weather data available."

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["weather_response"] = summary_text
    current_outputs["weather_data"] = result.get("structured_data")
    current_outputs["executed_node"] = "weather"

    return {
        "node_outputs": current_outputs,
        "final_response": summary_text,
    }
