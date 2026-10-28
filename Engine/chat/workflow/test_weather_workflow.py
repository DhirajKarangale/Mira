from __future__ import annotations

import asyncio
from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_paths = [
    _REPO_ROOT / "engine",
    _REPO_ROOT,
    _REPO_ROOT / "Vault",
]
for p in reversed(_paths):
    p_str = str(p)
    if p_str in sys.path:
        sys.path.remove(p_str)
    sys.path.insert(0, p_str)

from chat.workflow.weather_tool import (
    parse_location_from_query,
    parse_forecast_days_from_query,
    geocode_location,
    get_weather_forecast,
    synthesize_weather_response,
)
from chat.workflow.decision_node import _fast_route_heuristic, decision_node
from chat.workflow.graph import run_chat_workflow


class TestWeatherToolAndWorkflow(unittest.TestCase):
    """Test suite verifying weather location extraction, geocoding, natural synthesis, and workflow."""

    def test_location_parsing(self):
        cases = [
            ("What's the weather in Pune?", "Pune"),
            ("Oh Meera, just tell me the current weather and temperature of Pune, Maharashtra.", "Pune, Maharashtra"),
            ("What is the weather in Pune?", "Pune"),
            ("Tell me the temperature in Tokyo tomorrow", "Tokyo"),
            ("How hot is it in London right now?", "London"),
            ("Current weather at San Francisco, CA", "San Francisco, CA"),
            ("Weather of Mumbai, Maharashtra, India", "Mumbai, Maharashtra, India"),
            ("Is it raining outside?", None),
            ("What is the weather today?", None),
            ("Will it rain tomorrow?", None),
            ("Give me the 7 day forecast", None),
        ]
        for query, expected in cases:
            extracted = parse_location_from_query(query)
            self.assertEqual(extracted, expected, f"Query '{query}' expected '{expected}', got '{extracted}'")

    def test_forecast_days_parsing(self):
        self.assertEqual(parse_forecast_days_from_query("current weather and temperature of Pune", 7), 1)
        self.assertEqual(parse_forecast_days_from_query("weather today in Pune", 7), 1)
        self.assertEqual(parse_forecast_days_from_query("what will the weather be tomorrow in Pune", 7), 2)
        self.assertEqual(parse_forecast_days_from_query("next 3 days forecast for Pune", 7), 3)
        self.assertEqual(parse_forecast_days_from_query("weekly forecast for Pune", 7), 7)

    def test_geocoding_pune(self):
        res = geocode_location("Pune, Maharashtra")
        self.assertIsNotNone(res)
        self.assertEqual(res["name"], "Pune")
        self.assertAlmostEqual(res["latitude"], 18.52, places=1)
        self.assertAlmostEqual(res["longitude"], 73.85, places=1)
        self.assertIn("India", res["display_name"])

    def test_weather_forecast_with_explicit_location(self):
        result = get_weather_forecast(
            forecast_days=1,
            location_query="Pune",
        )
        self.assertEqual(result.get("status"), "success")
        structured = result.get("structured_data")
        self.assertIsNotNone(structured)
        self.assertIn("Pune", structured["location"]["name"])
        self.assertIn("current", structured)
        self.assertIn("temperature_celsius", structured["current"])

    def test_weather_forecast_fallback_profile(self):
        result = get_weather_forecast(
            forecast_days=1,
            user_profile={"city": "Shegaon", "state": "Maharashtra", "country": "India", "latitude": 20.702986, "longitude": 76.63637},
        )
        self.assertEqual(result.get("status"), "success")
        structured = result.get("structured_data")
        self.assertIsNotNone(structured)
        self.assertIn("Shegaon", structured["location"]["name"])

    def test_synthesize_weather_response_natural(self):
        mock_structured = {
            "current": {
                "condition": "Mainly clear",
                "temperature_celsius": 26.2,
                "apparent_temperature_celsius": 26.7,
                "relative_humidity_percent": 65,
                "wind_speed_kmh": 8.5,
                "precipitation_mm": 0.0,
                "rain_mm": 0.0,
            },
            "daily": [
                {
                    "date": "2026-10-28",
                    "day": "Wednesday, Oct 28",
                    "condition": "Mainly clear",
                    "temp_max_celsius": 32.0,
                    "temp_min_celsius": 20.0,
                    "precipitation_probability_percent": 2,
                    "rain_sum_mm": 0.0,
                }
            ]
        }
        answer = synthesize_weather_response(
            user_query="What's the weather in Pune?",
            structured_data=mock_structured,
            location_name="Pune, Maharashtra",
        )
        print(f"\n[Test Result] Natural Weather Response:\n{answer}\n")
        self.assertTrue(len(answer) < 250, f"Answer should be short and natural, got length {len(answer)}: {answer}")
        self.assertIn("Pune", answer)
        # Verify it sounds natural and does NOT dump coordinates or entire daily lists
        self.assertNotIn("Coordinates", answer)
        self.assertNotIn("Timezone", answer)
        self.assertNotIn("Upcoming Hourly Outlook", answer)

    def test_decision_heuristic_weather_routing(self):
        query = "What's the weather in Pune?"
        fast_res = _fast_route_heuristic(query, [])
        self.assertIsNotNone(fast_res)
        self.assertEqual(fast_res[0], "weather")

    def test_e2e_weather_workflow_natural(self):
        query = "What's the weather in Pune?"
        loop = asyncio.new_event_loop()
        try:
            response = loop.run_until_complete(
                run_chat_workflow(
                    job_id="test_job_123",
                    session_id="test_session_123",
                    user_query=query,
                )
            )
            print(f"\n[Test Result] Full Workflow Natural Response:\n{response}\n")
            self.assertTrue(len(response) < 250, f"Response too verbose: {response}")
            self.assertIn("Pune", response)
            self.assertNotIn("Upcoming Hourly Outlook", response)
            self.assertNotIn("Coordinates:", response)
        finally:
            loop.close()


if __name__ == "__main__":
    unittest.main()
