from __future__ import annotations

import logging
import re
from datetime import datetime, date, time as dtime, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo

logger = logging.getLogger("mira.engine.chat.timezone")

# Common country/city to timezone mappings
CITY_COUNTRY_TIMEZONES = {
    "india": "Asia/Kolkata",
    "pune": "Asia/Kolkata",
    "mumbai": "Asia/Kolkata",
    "delhi": "Asia/Kolkata",
    "bengaluru": "Asia/Kolkata",
    "bangalore": "Asia/Kolkata",
    "chennai": "Asia/Kolkata",
    "kolkata": "Asia/Kolkata",
    "hyderabad": "Asia/Kolkata",
    "us": "America/New_York",
    "usa": "America/New_York",
    "united states": "America/New_York",
    "new york": "America/New_York",
    "san francisco": "America/Los_Angeles",
    "california": "America/Los_Angeles",
    "uk": "Europe/London",
    "united kingdom": "Europe/London",
    "london": "Europe/London",
    "germany": "Europe/Berlin",
    "berlin": "Europe/Berlin",
    "tokyo": "Asia/Tokyo",
    "japan": "Asia/Tokyo",
    "singapore": "Asia/Singapore",
    "australia": "Australia/Sydney",
    "sydney": "Australia/Sydney",
}


def resolve_user_timezone(user_profile: Optional[Dict[str, Any]] = None) -> ZoneInfo:
    """
    Resolves the user's timezone from their profile (city, state, country, or explicit timezone).
    Falls back to system local timezone.
    """
    if user_profile and isinstance(user_profile, dict):
        # 1. Direct timezone field if provided
        for tz_key in ("timezone", "time_zone", "tz"):
            tz_val = user_profile.get(tz_key)
            if tz_val and isinstance(tz_val, str) and tz_val.strip():
                try:
                    return ZoneInfo(tz_val.strip())
                except Exception:
                    pass

        # 2. Match city
        city = str(user_profile.get("city") or "").strip().lower()
        if city in CITY_COUNTRY_TIMEZONES:
            try:
                return ZoneInfo(CITY_COUNTRY_TIMEZONES[city])
            except Exception:
                pass

        # 3. Match country
        country = str(user_profile.get("country") or "").strip().lower()
        if country in CITY_COUNTRY_TIMEZONES:
            try:
                return ZoneInfo(CITY_COUNTRY_TIMEZONES[country])
            except Exception:
                pass

    # 4. Fallback to system timezone
    try:
        sys_tz = datetime.now().astimezone().tzinfo
        if sys_tz:
            tz_name = getattr(sys_tz, "key", None) or str(sys_tz)
            if "/" in tz_name:
                return ZoneInfo(tz_name)
    except Exception:
        pass

    # Default fallback to Asia/Kolkata (MIRA default user locale) or UTC
    try:
        return ZoneInfo("Asia/Kolkata")
    except Exception:
        return ZoneInfo("UTC")


def parse_time_expression(
    expr: Optional[str],
    user_tz: ZoneInfo,
    now: Optional[datetime] = None
) -> Tuple[Optional[int], Optional[int], str]:
    """
    Parses natural language relative and absolute time expressions.
    Returns:
        (start_unix_timestamp, end_unix_timestamp, human_readable_description)
    All timestamps are UTC Unix timestamps in seconds.
    If expr is None, empty, or asks broadly without a date limit, returns (None, None, 'all available activity history').
    """
    if expr is None or not str(expr).strip():
        return None, None, "all available activity history"

    expr_clean = str(expr).strip().lower()
    if expr_clean in ("none", "null", "all", "all time", "recent", "overall", "any", "all available activity history"):
        return None, None, "all available activity history"

    if now is None:
        now = datetime.now(user_tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=user_tz)
    else:
        now = now.astimezone(user_tz)

    today = now.date()

    # Normalize common typos in natural language time queries (e.g. 'yesterady')
    expr_clean = re.sub(r'\byeste?r[ad]{1,2}y\b', 'yesterday', expr_clean)
    expr_clean = re.sub(r'\byest[au]rday\b', 'yesterday', expr_clean)
    expr_clean = re.sub(r'\btod[ay]{1,2}\b', 'today', expr_clean)
    expr_clean = re.sub(r'\btomm?orr?ow\b', 'tomorrow', expr_clean)

    # 0. Relative time expressions (e.g. "last 5 hours", "past 5 hours", "in the last 5 hours", "last 30 minutes")
    rel_hours_match = re.search(r'(?:in\s+the\s+|over\s+the\s+|for\s+the\s+)?(?:last|past)\s+(\d+)\s*(?:hours?|hrs?)\b', expr_clean)
    if rel_hours_match:
        hours = int(rel_hours_match.group(1))
        start_dt = now - timedelta(hours=hours)
        end_dt = now
        desc = f"the last {hours} hours ({start_dt.strftime('%I:%M %p')} to {end_dt.strftime('%I:%M %p')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    rel_single_hour = re.search(r'(?:in\s+the\s+|over\s+the\s+|for\s+the\s+)?(?:last|past)\s+hour\b', expr_clean)
    if rel_single_hour:
        start_dt = now - timedelta(hours=1)
        end_dt = now
        desc = f"the last hour ({start_dt.strftime('%I:%M %p')} to {end_dt.strftime('%I:%M %p')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    rel_mins_match = re.search(r'(?:in\s+the\s+|over\s+the\s+|for\s+the\s+)?(?:last|past)\s+(\d+)\s*(?:minutes?|mins?)\b', expr_clean)
    if rel_mins_match:
        mins = int(rel_mins_match.group(1))
        start_dt = now - timedelta(minutes=mins)
        end_dt = now
        desc = f"the last {mins} minutes ({start_dt.strftime('%I:%M %p')} to {end_dt.strftime('%I:%M %p')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    rel_days_match = re.search(r'(?:in\s+the\s+|over\s+the\s+|for\s+the\s+)?(?:last|past)\s+(\d+)\s*days?\b', expr_clean)
    if rel_days_match:
        days = int(rel_days_match.group(1))
        start_dt = datetime.combine(today - timedelta(days=days), dtime.min, tzinfo=user_tz)
        end_dt = datetime.combine(today, dtime.max, tzinfo=user_tz)
        desc = f"the past {days} days ({start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    # 1. "yesterday"
    if "yesterday" in expr_clean:
        y_date = today - timedelta(days=1)
        # Check sub-day parts e.g. "yesterday afternoon", "yesterday between 2 PM and 5 PM"
        start_dt, end_dt, sub_desc = _extract_subday_range(expr_clean, y_date, user_tz)
        if start_dt and end_dt:
            return int(start_dt.timestamp()), int(end_dt.timestamp()), f"yesterday {sub_desc}"
        start_dt = datetime.combine(y_date, dtime.min, tzinfo=user_tz)
        end_dt = datetime.combine(y_date, dtime.max, tzinfo=user_tz)
        return int(start_dt.timestamp()), int(end_dt.timestamp()), f"yesterday ({y_date.strftime('%Y-%m-%d')})"

    # 2. "today"
    if "today" in expr_clean or "this morning" in expr_clean or "this afternoon" in expr_clean or "tonight" in expr_clean:
        start_dt, end_dt, sub_desc = _extract_subday_range(expr_clean, today, user_tz)
        if start_dt and end_dt:
            return int(start_dt.timestamp()), int(end_dt.timestamp()), f"today {sub_desc}"
        start_dt = datetime.combine(today, dtime.min, tzinfo=user_tz)
        end_dt = datetime.combine(today, dtime.max, tzinfo=user_tz)
        return int(start_dt.timestamp()), int(end_dt.timestamp()), f"today ({today.strftime('%Y-%m-%d')})"

    # 3. "last month"
    if "last month" in expr_clean or "past month" in expr_clean:
        first_of_this_month = today.replace(day=1)
        last_day_prev_month = first_of_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)
        start_dt = datetime.combine(first_day_prev_month, dtime.min, tzinfo=user_tz)
        end_dt = datetime.combine(last_day_prev_month, dtime.max, tzinfo=user_tz)
        desc = f"last month ({first_day_prev_month.strftime('%B %Y')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    # 4. "this month"
    if "this month" in expr_clean:
        first_day = today.replace(day=1)
        start_dt = datetime.combine(first_day, dtime.min, tzinfo=user_tz)
        end_dt = now
        desc = f"this month ({first_day.strftime('%B %Y')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    # 5. "last week" or "past week"
    if "last week" in expr_clean or "past week" in expr_clean:
        start_day = today - timedelta(days=7)
        start_dt = datetime.combine(start_day, dtime.min, tzinfo=user_tz)
        end_dt = datetime.combine(today, dtime.max, tzinfo=user_tz)
        desc = f"past 7 days ({start_day.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')})"
        return int(start_dt.timestamp()), int(end_dt.timestamp()), desc

    # 6. Universal dynamic date parsing (handles all standard numeric and natural language calendar dates)
    try:
        from dateutil import parser as dt_parser
        default_dt = datetime(today.year, 1, 1, 0, 0, 0)
        parsed_dt = dt_parser.parse(expr_clean, fuzzy=True, default=default_dt)
        if parsed_dt:
            target_date = parsed_dt.date()
            start_dt, end_dt, sub_desc = _extract_subday_range(expr_clean, target_date, user_tz)
            if start_dt and end_dt:
                return int(start_dt.timestamp()), int(end_dt.timestamp()), f"{target_date.strftime('%B %d, %Y')} {sub_desc}"
            if parsed_dt.time() != dtime.min:
                st = datetime.combine(target_date, parsed_dt.time(), tzinfo=user_tz) - timedelta(minutes=30)
                et = st + timedelta(hours=1)
                return int(st.timestamp()), int(et.timestamp()), f"around {parsed_dt.strftime('%I:%M %p')} on {target_date.strftime('%B %d, %Y')}"
            start_dt = datetime.combine(target_date, dtime.min, tzinfo=user_tz)
            end_dt = datetime.combine(target_date, dtime.max, tzinfo=user_tz)
            return int(start_dt.timestamp()), int(end_dt.timestamp()), target_date.strftime('%B %d, %Y')
    except Exception:
        pass

    # 7. "between X and Y" on current date
    start_dt, end_dt, sub_desc = _extract_subday_range(expr_clean, today, user_tz)
    if start_dt and end_dt:
        return int(start_dt.timestamp()), int(end_dt.timestamp()), f"today {sub_desc}"

    # 8. "before X" or "after X"
    if "before" in expr_clean:
        t_parsed = _parse_clock_time(expr_clean, "before")
        if t_parsed:
            end_dt = datetime.combine(today, t_parsed, tzinfo=user_tz)
            start_dt = datetime.combine(today, dtime.min, tzinfo=user_tz)
            return int(start_dt.timestamp()), int(end_dt.timestamp()), f"before {t_parsed.strftime('%I:%M %p')}"

    if "after" in expr_clean or "since" in expr_clean:
        keyword = "after" if "after" in expr_clean else "since"
        t_parsed = _parse_clock_time(expr_clean, keyword)
        if t_parsed:
            start_dt = datetime.combine(today, t_parsed, tzinfo=user_tz)
            end_dt = datetime.combine(today, dtime.max, tzinfo=user_tz)
            return int(start_dt.timestamp()), int(end_dt.timestamp()), f"after {t_parsed.strftime('%I:%M %p')}"

    # No specific time detected -> return None for timestamps, indicates all periods or general
    return None, None, "all available activity history"


def _extract_subday_range(
    expr: str,
    base_date: date,
    user_tz: ZoneInfo
) -> Tuple[Optional[datetime], Optional[datetime], str]:
    """
    Extracts time-of-day bounds like 'between 9 AM and 5 PM', 'morning', 'afternoon', 'evening'.
    """
    # Time ranges: "11:00 am to 02:00 pm", "from 9 AM to 5 PM", "between 9 AM and 5 PM", "11 am - 2 pm"
    range_match = re.search(
        r'(?:\bfrom\s+|\bbetween\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:to|and|-|until|till)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)',
        expr
    )
    if range_match:
        t1 = _to_dtime(range_match.group(1).strip())
        t2 = _to_dtime(range_match.group(2).strip())
        if t1 and t2:
            dt1 = datetime.combine(base_date, t1, tzinfo=user_tz)
            dt2 = datetime.combine(base_date, t2, tzinfo=user_tz)
            if "between" in expr:
                return dt1, dt2, f"between {t1.strftime('%I:%M %p')} and {t2.strftime('%I:%M %p')}"
            return dt1, dt2, f"{t1.strftime('%I:%M %p')} to {t2.strftime('%I:%M %p')}"

    # After / Since / Post / From X
    after_match = re.search(
        r'\b(?:after|since|post|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|noon|midnight)?(?:\s*onwards?)?)',
        expr
    )
    if after_match:
        raw_val = re.sub(r'\s*onwards?$', '', after_match.group(1).strip())
        t = _to_dtime(raw_val)
        if t:
            dt1 = datetime.combine(base_date, t, tzinfo=user_tz)
            dt2 = datetime.combine(base_date, dtime.max, tzinfo=user_tz)
            return dt1, dt2, f"after {t.strftime('%I:%M %p')}"

    # Before / Until / Till / Prior to / Up to X
    before_match = re.search(
        r'\b(?:before|until|till|prior\s+to|up\s+to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|noon|midnight)?)',
        expr
    )
    if before_match:
        t = _to_dtime(before_match.group(1).strip())
        if t:
            dt1 = datetime.combine(base_date, dtime.min, tzinfo=user_tz)
            dt2 = datetime.combine(base_date, t, tzinfo=user_tz)
            return dt1, dt2, f"before {t.strftime('%I:%M %p')}"

    # Around / At X
    at_match = re.search(
        r'\b(?:around|at|approx(?:\.|imately)?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|noon|midnight)?)',
        expr
    )
    if at_match:
        t = _to_dtime(at_match.group(1).strip())
        if t:
            center_dt = datetime.combine(base_date, t, tzinfo=user_tz)
            dt1 = max(datetime.combine(base_date, dtime.min, tzinfo=user_tz), center_dt - timedelta(hours=1))
            dt2 = min(datetime.combine(base_date, dtime.max, tzinfo=user_tz), center_dt + timedelta(hours=1))
            return dt1, dt2, f"around {t.strftime('%I:%M %p')} ({dt1.strftime('%I:%M %p')} to {dt2.strftime('%I:%M %p')})"

    # Part of day
    if "morning" in expr:
        dt1 = datetime.combine(base_date, dtime(6, 0), tzinfo=user_tz)
        dt2 = datetime.combine(base_date, dtime(12, 0), tzinfo=user_tz)
        return dt1, dt2, "morning (6:00 AM - 12:00 PM)"

    if "afternoon" in expr:
        dt1 = datetime.combine(base_date, dtime(12, 0), tzinfo=user_tz)
        dt2 = datetime.combine(base_date, dtime(17, 0), tzinfo=user_tz)
        return dt1, dt2, "afternoon (12:00 PM - 5:00 PM)"

    if "evening" in expr:
        dt1 = datetime.combine(base_date, dtime(17, 0), tzinfo=user_tz)
        dt2 = datetime.combine(base_date, dtime(21, 0), tzinfo=user_tz)
        return dt1, dt2, "evening (5:00 PM - 9:00 PM)"

    if "night" in expr:
        dt1 = datetime.combine(base_date, dtime(21, 0), tzinfo=user_tz)
        dt2 = datetime.combine(base_date, dtime(23, 59, 59), tzinfo=user_tz)
        return dt1, dt2, "night (9:00 PM - 11:59 PM)"

    return None, None, ""


def _parse_clock_time(expr: str, prefix: str) -> Optional[dtime]:
    pattern = rf'{prefix}\s+(\d{{1,2}}(?::\d{{2}})?\s*(?:am|pm|noon|midnight)?)'
    match = re.search(pattern, expr)
    if match:
        return _to_dtime(match.group(1).strip())
    return None


def _to_dtime(raw: str) -> Optional[dtime]:
    r = raw.strip().lower()
    if r == "noon":
        return dtime(12, 0)
    if r == "midnight":
        return dtime(0, 0)

    # 12-hour format e.g. 9am, 9:30pm, 9 am, 9:30 pm
    match_12 = re.match(r'^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$', r)
    if match_12:
        hour = int(match_12.group(1))
        minute = int(match_12.group(2) or 0)
        ampm = match_12.group(3)
        if ampm == "pm" and hour != 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        return dtime(hour, minute)

    # 24-hour format e.g. 14:00, 09:30
    match_24 = re.match(r'^(\d{1,2}):(\d{2})$', r)
    if match_24:
        hour = int(match_24.group(1))
        minute = int(match_24.group(2))
        if 0 <= hour < 24 and 0 <= minute < 60:
            return dtime(hour, minute)

    # Bare hour e.g. "9", "17"
    if r.isdigit():
        h = int(r)
        if 0 <= h < 24:
            return dtime(h, 0)

    return None


def format_timestamp_in_tz(unix_ts: int, user_tz: ZoneInfo) -> str:
    """
    Formats a Unix timestamp (seconds) into a readable localized string.
    """
    dt = datetime.fromtimestamp(unix_ts, tz=user_tz)
    return dt.strftime("%Y-%m-%d %I:%M %p")
