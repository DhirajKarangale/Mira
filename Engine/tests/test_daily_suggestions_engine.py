import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app import app
from daily_suggestions.weather_section import (
    is_weather_refresh_needed,
    generate_weather_suggestion,
    generate_rest_of_day_overview,
)
from daily_suggestions.news_section import (
    is_news_refresh_needed,
    select_top_three_stories_with_llm,
)
from daily_suggestions.suggestions_section import (
    is_suggestions_refresh_needed,
    determine_suggestion_count,
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

        # 1. Rest of day overview
        overview = generate_rest_of_day_overview(mock_weather_data, city_name="Shegaon")
        self.assertIsInstance(overview, str)
        self.assertGreater(len(overview), 5)

        # 2. Valuable suggestion
        suggestion = generate_weather_suggestion(
            mock_weather_data,
            user_name="Dhiraj",
            city_name="Shegaon",
            rest_of_day=overview,
        )
        self.assertIsInstance(suggestion, str)
        self.assertGreater(len(suggestion), 10)
        # Should not contain childish cliches
        self.assertNotIn("human popsicle", suggestion.lower())
        self.assertNotIn("puddle", suggestion.lower())


if __name__ == "__main__":
    unittest.main()
