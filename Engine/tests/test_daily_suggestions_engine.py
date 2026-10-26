import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi.testclient import TestClient

from app import app
from daily_suggestions.weather_section import (
    is_weather_refresh_needed,
    generate_weather_suggestion,
    generate_rest_of_day_overview,
    generate_weather_short_summary,
    generate_weather_funny_suggestion,
    check_weather_advisory_need,
    get_time_of_day_context,
    refresh_weather_forecast,
)
from daily_suggestions.news_section import (
    is_news_refresh_needed,
    select_top_three_stories_with_llm,
    verify_article_timestamp,
    normalize_story_title,
    refresh_news,
)
from daily_suggestions.suggestions_section import (
    is_suggestions_refresh_needed,
    determine_suggestion_count,
    analyze_suggestions_history,
    retrieve_rich_activity_signals,
    generate_daily_suggestions_with_llm,
)
from daily_suggestions.scheduler import scheduler, get_daily_suggestions_status


class TestDailySuggestionsEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_weather_refresh_needed_logic(self):
        """Verify weather refresh interval logic (12 hours)."""
        now = datetime.now(timezone.utc)

        # 1. Empty record -> refresh needed
        self.assertTrue(is_weather_refresh_needed(None))
        self.assertTrue(is_weather_refresh_needed({}))

        # 2. Null or empty weather -> refresh needed
        self.assertTrue(is_weather_refresh_needed({"weather": {}, "date_weather": now.isoformat()}))

        # 3. Fresh weather (2 hours old) -> NOT needed
        fresh_ts = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertFalse(is_weather_refresh_needed({
            "weather": {"current": {"temperature_celsius": 20}},
            "date_weather": fresh_ts,
        }, interval_hours=12.0))

        # 4. Stale weather (13 hours old) -> refresh needed
        stale_ts = (now - timedelta(hours=13)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertTrue(is_weather_refresh_needed({
            "weather": {"current": {"temperature_celsius": 20}},
            "date_weather": stale_ts,
        }, interval_hours=12.0))

    def test_weather_suggestion_generation(self):
        """Verify weather suggestion generates humorous, friendly suggestion."""
        structured_hot = {
            "current": {
                "condition": "Sunny",
                "temperature_celsius": 34,
                "apparent_temperature_celsius": 36,
                "relative_humidity_percent": 40,
                "wind_speed_kmh": 10,
                "rain_mm": 0,
            },
            "daily": [{"temp_max_celsius": 35, "temp_min_celsius": 24, "precipitation_probability_percent": 0}],
        }
        with patch("daily_suggestions.weather_section.call_llm", return_value="It's hot outside today! Slap on some sunscreen before you turn into a baked potato."):
            suggestion = generate_weather_suggestion(structured_hot, user_name="Dhiraj", city_name="Pune")
            self.assertIn("sunscreen", suggestion.lower())

    def test_news_refresh_needed_logic(self):
        """Verify news refresh interval logic (3 hours)."""
        now = datetime.now(timezone.utc)

        # 1. Empty news -> refresh needed
        self.assertTrue(is_news_refresh_needed(None))
        self.assertTrue(is_news_refresh_needed({"news": [], "date_news": now.isoformat()}))

        # 2. Fresh news (1 hour old) -> NOT needed
        fresh_ts = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertFalse(is_news_refresh_needed({
            "news": [{"title": "News A"}],
            "date_news": fresh_ts,
        }, interval_hours=3.0))

        # 3. Stale news (4 hours old) -> refresh needed
        stale_ts = (now - timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertTrue(is_news_refresh_needed({
            "news": [{"title": "News A"}],
            "date_news": stale_ts,
        }, interval_hours=3.0))

    def test_news_story_selection_picks_three(self):
        """Verify story selection picks at most 3 distinct stories."""
        sample_articles = [
            {"title": "Story 1", "description": "Summary 1", "url": "https://a.com/1", "source": {"name": "BBC"}},
            {"title": "Story 2", "description": "Summary 2", "url": "https://a.com/2", "source": {"name": "Reuters"}},
            {"title": "Story 3", "description": "Summary 3", "url": "https://a.com/3", "source": {"name": "TechCrunch"}},
            {"title": "Story 4", "description": "Summary 4", "url": "https://a.com/4", "source": {"name": "AP"}},
        ]
        selected = select_top_three_stories_with_llm(sample_articles, location_desc="World")
        self.assertLessEqual(len(selected), 3)
        self.assertGreaterEqual(len(selected), 1)
        for s in selected:
            self.assertIn("title", s)
            self.assertIn("summary", s)
            self.assertIn("url", s)

    def test_suggestions_refresh_needed_logic(self):
        """Verify suggestions refresh interval logic (24 hours)."""
        now = datetime.now(timezone.utc)

        # 1. Empty suggestions -> refresh needed
        self.assertTrue(is_suggestions_refresh_needed(None))
        self.assertTrue(is_suggestions_refresh_needed({"suggestions": [], "date_suggestions": now.isoformat()}))

        # 2. Fresh suggestions (5 hours old) -> NOT needed
        fresh_ts = (now - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertFalse(is_suggestions_refresh_needed({
            "suggestions": ["Task 1", "Task 2"],
            "date_suggestions": fresh_ts,
        }, interval_hours=24.0))

        # 3. Stale suggestions (25 hours old) -> refresh needed
        stale_ts = (now - timedelta(hours=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertTrue(is_suggestions_refresh_needed({
            "suggestions": ["Task 1"],
            "date_suggestions": stale_ts,
        }, interval_hours=24.0))

    def test_determine_suggestion_count_history_analysis(self):
        """Verify suggestion count calculation based on 2-week history."""
        # Case A: No history -> returns between 4 and 9
        count_random = determine_suggestion_count([], is_weekend=False)
        self.assertGreaterEqual(count_random, 4)
        self.assertLessEqual(count_random, 9)

        # Case B: High completion history (>75%)
        high_history = [
            {"suggestions": ["A", "B", "C", "D"], "completed": [0, 1, 2, 3], "date_suggestions": "2026-10-25T10:00:00Z"},
            {"suggestions": ["E", "F", "G"], "completed": [0, 1], "date_suggestions": "2026-10-24T10:00:00Z"},
        ]
        count_high = determine_suggestion_count(high_history, is_weekend=False)
        self.assertGreaterEqual(count_high, 5)

        # Case C: Low completion history (<40%)
        low_history = [
            {"suggestions": ["A", "B", "C", "D", "E"], "completed": [0], "date_suggestions": "2026-10-25T10:00:00Z"},
            {"suggestions": ["F", "G", "H", "I"], "completed": [], "date_suggestions": "2026-10-24T10:00:00Z"},
        ]
        count_low = determine_suggestion_count(low_history, is_weekend=False)
        self.assertLessEqual(count_low, 6)

    def test_daily_suggestions_fastapi_endpoints(self):
        """Verify /daily_suggestions, /daily_suggestions/previous, /daily_suggestions/status."""
        # 1. GET /daily_suggestions
        resp = self.client.get("/daily_suggestions")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("today", data)
        self.assertIn("previous", data)
        self.assertIn("scheduler", data)

        # 2. GET /daily_suggestions/status
        status_resp = self.client.get("/daily_suggestions/status")
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.json()
        self.assertIn("weather", status_data)
        self.assertIn("news", status_data)
        self.assertIn("suggestions", status_data)
        self.assertEqual(status_data["weather"]["interval_hours"], 12.0)
        self.assertEqual(status_data["news"]["interval_hours"], 3.0)
        self.assertEqual(status_data["suggestions"]["interval_hours"], 24.0)

    def test_rest_of_day_overview_and_valuable_suggestion(self):
        """Verify rest_of_day short overview and practical valuable suggestion generation."""
        mock_weather_data = {
            "current": {
                "time": "2026-10-26T14:00",
                "condition": "Mainly clear",
                "temperature_celsius": 32.0,
                "apparent_temperature_celsius": 31.5,
                "relative_humidity_percent": 30,
                "wind_speed_kmh": 12.0,
            },
            "daily": [{
                "temp_max_celsius": 33.5,
                "temp_min_celsius": 21.0,
                "precipitation_probability_percent": 10,
            }],
            "hourly_highlights": [
                {"time": "2026-10-26T14:00", "formatted_time": "02:00 PM", "temperature_celsius": 32.0, "condition": "Mainly clear", "precipitation_probability_percent": 0, "rain_mm": 0.0},
                {"time": "2026-10-26T15:00", "formatted_time": "03:00 PM", "temperature_celsius": 33.5, "condition": "Sunny", "precipitation_probability_percent": 0, "rain_mm": 0.0},
                {"time": "2026-10-26T18:00", "formatted_time": "06:00 PM", "temperature_celsius": 29.0, "condition": "Clear sky", "precipitation_probability_percent": 0, "rain_mm": 0.0},
                {"time": "2026-10-26T21:00", "formatted_time": "09:00 PM", "temperature_celsius": 25.0, "condition": "Clear sky", "precipitation_probability_percent": 0, "rain_mm": 0.0},
            ]
        }

        # 1. Short summary (concise overview of current weather and forecast)
        short_summary = generate_weather_short_summary(mock_weather_data, city_name="Shegaon")
        self.assertIsInstance(short_summary, str)
        self.assertGreater(len(short_summary), 5)

        overview = generate_rest_of_day_overview(mock_weather_data, city_name="Shegaon")
        self.assertEqual(overview, short_summary)

        # 2. Funny descriptive suggestion (playful recommendation based on actual conditions)
        funny_suggestion = generate_weather_funny_suggestion(
            mock_weather_data,
            user_name="Dhiraj",
            city_name="Shegaon",
            short_summary=short_summary,
        )
        self.assertIsInstance(funny_suggestion, str)
        self.assertGreater(len(funny_suggestion), 10)

    def test_news_timestamp_verification_and_deduplication(self):
        """Verify publication timestamps within 36 hours and title normalization."""
        now = datetime.now(timezone.utc)

        # 1. Fresh article (5 hours ago)
        fresh_pub = (now - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        fresh_art = {"title": "Tech Breakthrough Today", "publishedAt": fresh_pub}
        is_fresh, age, iso_pub = verify_article_timestamp(fresh_art, max_hours=36.0)
        self.assertTrue(is_fresh)
        self.assertAlmostEqual(age, 5.0, delta=1.0)
        self.assertEqual(iso_pub, fresh_pub)

        # 2. Stale article (48 hours ago)
        stale_pub = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
        stale_art = {"title": "Old News Two Days Ago", "publishedAt": stale_pub}
        is_fresh, age, iso_pub = verify_article_timestamp(stale_art, max_hours=36.0)
        self.assertFalse(is_fresh)
        self.assertAlmostEqual(age, 48.0, delta=1.0)

        # 3. Invalid or missing timestamp gracefully treated as stale
        missing_art = {"title": "Unknown Date Story"}
        is_fresh, age, iso_pub = verify_article_timestamp(missing_art, max_hours=36.0)
        self.assertFalse(is_fresh)

        # 4. Title normalization for deduplication
        norm_a = normalize_story_title("NASA's Mars Rover Finds Water Ice On Red Planet!")
        norm_b = normalize_story_title("nasas mars rover finds water ice on red planet")
        self.assertEqual(norm_a, norm_b)

    def test_weather_skipped_when_location_not_configured(self):
        """Verify refresh_weather_forecast does not call Open-Meteo or LLM when location is not configured."""
        import asyncio
        empty_profile = {"user_name": "TestUser", "city": "", "latitude": None, "longitude": None}

        with patch("daily_suggestions.weather_section.get_user_profile", return_value=empty_profile), \
             patch("daily_suggestions.weather_section.get_user_coordinates", return_value=(None, None, empty_profile)), \
             patch("daily_suggestions.weather_section.get_weather_forecast") as mock_forecast:
            res = asyncio.run(refresh_weather_forecast(force=True))
            mock_forecast.assert_not_called()
            self.assertEqual(res, {})

    def test_news_skipped_when_location_not_configured(self):
        """Verify refresh_news does not call GNews or LLM when user location is not configured."""
        import asyncio
        empty_profile = {"user_name": "TestUser", "country": "", "city": "", "state": "", "latitude": None, "longitude": None}

        with patch("daily_suggestions.news_section.get_user_profile", return_value=empty_profile), \
             patch("daily_suggestions.news_section.fetch_news_from_gnews") as mock_gnews:
            res = asyncio.run(refresh_news(force=True))
            mock_gnews.assert_not_called()
            self.assertEqual(res, [])

    def test_same_day_suggestions_remain_constant_on_refresh(self):
        """Verify suggestions for today remain constant on refresh and do NOT re-call LLM."""
        import asyncio
        from daily_suggestions.suggestions_section import refresh_suggestions, is_same_day_as_today

        now_utc = datetime.now(timezone.utc)
        today_record = {
            "id": 42,
            "suggestions": ["Constant Suggestion 1", "Constant Suggestion 2"],
            "date_suggestions": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "completed": [0],
        }

        # 1. Verify is_same_day_as_today
        self.assertTrue(is_same_day_as_today(today_record["date_suggestions"]))

        # 2. When calling refresh_suggestions with today's record, it should NOT call LLM
        with patch("daily_suggestions.suggestions_section.fetch_latest_daily_suggestions", return_value=today_record), \
             patch("daily_suggestions.suggestions_section.get_user_profile", return_value={"timezone": "UTC"}), \
             patch("daily_suggestions.suggestions_section.call_llm") as mock_llm:
            res = asyncio.run(refresh_suggestions(force=False, force_regenerate=False))
            mock_llm.assert_not_called()
            self.assertEqual(res, ["Constant Suggestion 1", "Constant Suggestion 2"])

    def test_location_change_cancels_and_reruns_weather_and_news(self):
        """Verify handle_location_change cancels in-progress tasks and re-runs both weather & news."""
        import asyncio

        with patch.object(scheduler, "cancel_and_run_weather", return_value={"status": "success", "location": "NewCity"}) as mock_w, \
             patch.object(scheduler, "cancel_and_run_news", return_value=[{"title": "New Headline"}]) as mock_n:
            res = asyncio.run(scheduler.handle_location_change())
            mock_w.assert_called_once_with(force=True)
            mock_n.assert_called_once_with(force=True)
    def test_weather_advisory_need_detection(self):
        """Verify weather advisory detection accurately separates calm conditions from severe/actionable ones."""
        # 1. Calm, mild conditions -> No advisory needed
        mild_data = {
            "current": {"condition": "Mainly clear", "temperature_celsius": 24, "apparent_temperature_celsius": 24, "wind_speed_kmh": 8, "rain_mm": 0},
            "daily": [{"temp_max_celsius": 27, "temp_min_celsius": 18, "precipitation_probability_percent": 0}],
            "hourly_highlights": [],
        }
        has_adv, adv_type, _ = check_weather_advisory_need(mild_data)
        self.assertFalse(has_adv)
        self.assertEqual(adv_type, "none")

        # 2. Rain condition -> Rain advisory
        rain_data = {
            "current": {"condition": "Light rain shower", "temperature_celsius": 22, "wind_speed_kmh": 12, "rain_mm": 1.5},
            "daily": [{"temp_max_celsius": 24, "temp_min_celsius": 19, "precipitation_probability_percent": 80}],
            "hourly_highlights": [],
        }
        has_adv, adv_type, _ = check_weather_advisory_need(rain_data)
        self.assertTrue(has_adv)
        self.assertEqual(adv_type, "rain")

        # 3. High heat -> Heat advisory
        heat_data = {
            "current": {"condition": "Clear", "temperature_celsius": 36, "apparent_temperature_celsius": 38, "wind_speed_kmh": 10, "rain_mm": 0},
            "daily": [{"temp_max_celsius": 37, "temp_min_celsius": 26, "precipitation_probability_percent": 0}],
            "hourly_highlights": [],
        }
        has_adv, adv_type, _ = check_weather_advisory_need(heat_data)
        self.assertTrue(has_adv)
        self.assertEqual(adv_type, "heat")

    def test_weather_suggestion_all_clear_message(self):
        """Verify when no advisory is needed, message explicitly mentions no precautions needed with time-of-day context."""
        mild_data = {
            "current": {"condition": "Clear", "temperature_celsius": 25, "apparent_temperature_celsius": 25, "wind_speed_kmh": 10, "rain_mm": 0},
            "daily": [{"temp_max_celsius": 28, "temp_min_celsius": 19, "precipitation_probability_percent": 0}],
            "hourly_highlights": [],
        }
        dt_afternoon = datetime(2026, 10, 26, 14, 30)
        time_name, greeting = get_time_of_day_context(dt_afternoon)
        self.assertEqual(time_name, "Afternoon")

        # With LLM returning None / exception -> deterministic fallback
        with patch("daily_suggestions.weather_section.call_llm", side_effect=Exception("LLM offline")):
            msg = generate_weather_funny_suggestion(mild_data, user_name="Dhiraj", city_name="Shegaon", now_dt=dt_afternoon)
            self.assertIn("No weather", msg)
            self.assertIn("afternoon", msg.lower())

    def test_news_domestic_country_prioritization(self):
        """Verify news selection prioritizes domestic national stories over foreign/world stories."""
        candidates = [
            {
                "title": "ISRO Launches Next-Gen Communications Satellite",
                "description": "India space agency successfully placed advanced satellite in orbit.",
                "url": "https://news.in/isro",
                "source": {"name": "The Hindu"},
                "_priority_tier": 1,
                "_is_within_36h": True,
                "_age_hours": 3.0,
            },
            {
                "title": "Maharashtra Unveils High-Speed Freight Corridor",
                "description": "Key industrial rail line inaugurated connecting ports.",
                "url": "https://news.in/freight",
                "source": {"name": "Indian Express"},
                "_priority_tier": 2,
                "_is_within_36h": True,
                "_age_hours": 5.0,
            },
            {
                "title": "Brazil Presidential Election Enters Intense Final Week",
                "description": "Lula and opponents rally in Brasilia.",
                "url": "https://world.com/brazil",
                "source": {"name": "Reuters"},
                "_priority_tier": 4,
                "_is_within_36h": True,
                "_age_hours": 2.0,
            },
        ]
        # In deterministic fallback mode:
        with patch("daily_suggestions.news_section.call_llm", side_effect=Exception("LLM offline")):
            selected = select_top_three_stories_with_llm(
                articles=candidates,
                location_desc="Shegaon, India",
                country_name="India"
            )
            self.assertGreaterEqual(len(selected), 2)
            # The first selected story must be the domestic national one
            self.assertIn("ISRO", selected[0]["title"])

    def test_analyze_suggestions_history_extracts_pending_and_rates(self):
        """Verify analyze_suggestions_history calculates completion rates and extracts yesterday's pending tasks."""
        history = [
            {
                "id": 10,
                "suggestions": ["Build Login UI", "Write Auth Endpoint", "Add Unit Tests", "Deploy to Staging"],
                "completed": [0, 2],
                "date_suggestions": "2026-10-25T09:00:00Z",  # Yesterday
            },
            {
                "id": 9,
                "suggestions": ["Task A", "Task B"],
                "completed": [0, 1],
                "date_suggestions": "2026-10-24T09:00:00Z",
            },
        ]
        # Calling analyze_suggestions_history for today
        signals = analyze_suggestions_history(history, is_weekend=False, user_profile={"timezone": "UTC"})
        self.assertGreaterEqual(signals["overall_rate"], 0.6)
        # Pending from yesterday should be index 1 ("Write Auth Endpoint") and index 3 ("Deploy to Staging")
        self.assertEqual(signals["pending_from_yesterday"], ["Write Auth Endpoint", "Deploy to Staging"])
        self.assertIn("pace_guidance", signals)

    def test_activity_signals_frustration_only_with_evidence(self):
        """Verify frustration is NOT assumed without supporting error/debugging evidence."""
        # Case A: Normal smooth workflow -> No frustration
        normal_records = [
            {"app_name": "Code.exe", "summarized_text": "The user is editing suggestions_section.py and writing a test."},
            {"app_name": "Code.exe", "summarized_text": "The user is running pytest successfully on Engine."},
        ]
        with patch("chat.workflow.user_activity_node._find_relevant_knowledge_bases", return_value=[Path("/tmp/kb")]), \
             patch("chat.workflow.user_activity_node._search_across_knowledge_bases", return_value=normal_records), \
             patch("chat.workflow.user_activity_node._build_session_blocks", return_value=[]):
            signals = retrieve_rich_activity_signals({"timezone": "UTC"})
            self.assertFalse(signals["frustration"]["detected"])
            self.assertIn("No frustration", signals["frustration"]["evidence"])

        # Case B: Recurring error patterns -> Frustration detected
        error_records = [
            {"app_name": "terminal", "summarized_text": "SyntaxError: invalid syntax at line 42"},
            {"app_name": "terminal", "summarized_text": "ConnectionRefusedError: [WinError 10061] target machine actively refused"},
            {"app_name": "terminal", "summarized_text": "Fatal error: failed test assertion during build"},
        ]
        with patch("chat.workflow.user_activity_node._find_relevant_knowledge_bases", return_value=[Path("/tmp/kb")]), \
             patch("chat.workflow.user_activity_node._search_across_knowledge_bases", return_value=error_records), \
             patch("chat.workflow.user_activity_node._build_session_blocks", return_value=[]):
            signals = retrieve_rich_activity_signals({"timezone": "UTC"})
            self.assertTrue(signals["frustration"]["detected"])

    def test_activity_signals_learning_and_reminders(self):
        """Verify learning opportunities and smart reminders are extracted from activity records."""
        records = [
            {"app_name": "chrome.exe", "summarized_text": "Browsing devpost.com hackathon registration page"},
            {"app_name": "chrome.exe", "summarized_text": "Reading fastapi documentation and api reference for background tasks"},
        ]
        with patch("chat.workflow.user_activity_node._find_relevant_knowledge_bases", return_value=[Path("/tmp/kb")]), \
             patch("chat.workflow.user_activity_node._search_across_knowledge_bases", return_value=records), \
             patch("chat.workflow.user_activity_node._build_session_blocks", return_value=[]):
            signals = retrieve_rich_activity_signals({"timezone": "UTC"})
            self.assertTrue(signals["learning"]["detected"])
            self.assertIn("Fastapi", signals["learning"]["topics"])
            self.assertTrue(signals["reminders"]["detected"])
            self.assertIn("hackathon", signals["reminders"]["items"][0].lower())

    def test_generate_daily_suggestions_weekend_plan_and_fallbacks(self):
        """Verify weekend planning produces balanced work, outings/family, and relaxation, with fallback honoring signals."""
        now_saturday = datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc)
        history_signals = {
            "pending_from_yesterday": ["Finish Auth PR"],
            "overall_rate": 0.7,
            "pace_guidance": "Balanced pace",
        }
        activity_signals = {
            "ongoing_work": ["Mira Engine Backend"],
            "frustration": {"detected": False},
            "context_switching": {"detected": False},
            "learning": {"detected": True, "topics": ["FastAPI"]},
            "reminders": {"detected": True, "items": ["Submit hackathon application"]},
        }
        # In fallback mode (LLM offline):
        with patch("daily_suggestions.suggestions_section.call_llm", side_effect=Exception("LLM offline")):
            suggestions = generate_daily_suggestions_with_llm(
                target_count=5,
                user_name="Dhiraj",
                user_profile={"user_name": "Dhiraj", "city": "Shegaon"},
                activity_summary="Active coding session",
                now_dt=now_saturday,
                history_signals=history_signals,
                activity_signals=activity_signals,
            )
            self.assertEqual(len(suggestions), 5)
            # Pending task from yesterday prioritized
            self.assertIn("Finish Auth PR", suggestions[0])
            # Contains weekend rejuvenation / family / outing or relaxation
            has_weekend_balance = any("weekend" in s.lower() or "outing" in s.lower() or "family" in s.lower() or "unwind" in s.lower() for s in suggestions)
            self.assertTrue(has_weekend_balance)


if __name__ == "__main__":
    unittest.main()

