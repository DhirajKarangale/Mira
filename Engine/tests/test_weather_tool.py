from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure Engine, Memory, Vault paths are accessible
_engine_dir = Path(__file__).resolve().parent.parent
_root_dir = _engine_dir.parent
for p in (_root_dir / "Vault", _root_dir / "Memory", _root_dir, _engine_dir):
    if str(p) in sys.path:
        sys.path.remove(str(p))
    sys.path.insert(0, str(p))

from llm.config import load_work_configs
from config import set_user_profile, get_user_profile
from chat.workflow.state import AgentState
from chat.workflow.decision_node import decision_node, _heuristic_fallback
from chat.workflow.weather_tool import (
    get_weather_forecast,
    weather_forecast_node,
    fetch_open_meteo_forecast,
    validate_forecast_days,
    parse_forecast_days_from_query,
    get_user_coordinates,
    get_weather_description,
    format_weather_report,
    OPEN_METEO_FORECAST_URL,
)
from chat.workflow.graph import (
    build_workflow_graph,
    run_chat_workflow,
    register_tool,
    get_registered_tools,
)


class TestWeatherForecastTool(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        load_work_configs()
        # Seed mock user profile with coordinates in memory
        self.mock_profile_with_coords = {
            "user_name": "Dhiraj",
            "email": "dakarangale02@gmail.com",
            "phone_number": "+91 7620320595",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "latitude": 18.5204,
            "longitude": 73.8567,
            "exists": True,
        }
        set_user_profile(self.mock_profile_with_coords)

        # Restore weather tool in graph registry
        register_tool("weather", weather_forecast_node)

        # Realistic mock Open-Meteo response matching required fields
        self.mock_open_meteo_response = {
            "latitude": 18.52,
            "longitude": 73.86,
            "generationtime_ms": 0.12,
            "utc_offset_seconds": 19800,
            "timezone": "Asia/Kolkata",
            "timezone_abbreviation": "IST",
            "elevation": 560.0,
            "current_units": {
                "time": "iso8601",
                "temperature_2m": "°C",
                "relative_humidity_2m": "%",
                "apparent_temperature": "°C",
                "precipitation": "mm",
                "rain": "mm",
                "snowfall": "cm",
                "weather_code": "wmo code",
                "wind_speed_10m": "km/h",
            },
            "current": {
                "time": "2026-10-26T14:30",
                "temperature_2m": 31.5,
                "relative_humidity_2m": 28,
                "apparent_temperature": 30.2,
                "precipitation": 0.0,
                "rain": 0.0,
                "snowfall": 0.0,
                "weather_code": 0,
                "wind_speed_10m": 12.5,
            },
            "daily_units": {
                "time": "iso8601",
                "weather_code": "wmo code",
                "temperature_2m_max": "°C",
                "temperature_2m_min": "°C",
                "apparent_temperature_max": "°C",
                "apparent_temperature_min": "°C",
                "precipitation_sum": "mm",
                "rain_sum": "mm",
                "snowfall_sum": "cm",
                "precipitation_probability_max": "%",
                "wind_speed_10m_max": "km/h",
            },
            "daily": {
                "time": ["2026-10-26", "2026-10-27", "2026-10-28"],
                "weather_code": [0, 1, 2],
                "temperature_2m_max": [32.5, 31.8, 30.5],
                "temperature_2m_min": [19.2, 18.9, 18.0],
                "apparent_temperature_max": [31.0, 30.5, 29.8],
                "apparent_temperature_min": [18.5, 18.0, 17.5],
                "precipitation_sum": [0.0, 0.0, 0.2],
                "rain_sum": [0.0, 0.0, 0.2],
                "snowfall_sum": [0.0, 0.0, 0.0],
                "precipitation_probability_max": [0, 10, 25],
                "wind_speed_10m_max": [15.1, 13.8, 14.0],
            },
            "hourly_units": {
                "time": "iso8601",
                "temperature_2m": "°C",
                "relative_humidity_2m": "%",
                "apparent_temperature": "°C",
                "precipitation_probability": "%",
                "precipitation": "mm",
                "rain": "mm",
                "snowfall": "cm",
                "weather_code": "wmo code",
                "wind_speed_10m": "km/h",
            },
            "hourly": {
                "time": [f"2026-10-26T{h:02d}:00" for h in range(24)],
                "temperature_2m": [20.0 + (h % 12) for h in range(24)],
                "relative_humidity_2m": [30 + (h % 20) for h in range(24)],
                "apparent_temperature": [19.5 + (h % 12) for h in range(24)],
                "precipitation_probability": [5 * (h % 5) for h in range(24)],
                "precipitation": [0.0] * 24,
                "rain": [0.0] * 24,
                "snowfall": [0.0] * 24,
                "weather_code": [0] * 24,
                "wind_speed_10m": [10.0 + (h % 6) for h in range(24)],
            },
        }

    # =========================================================================
    # 1. Tool Input & Range Validation Tests
    # =========================================================================
    def test_forecast_days_validation_and_clamping(self):
        """Verify forecast days validation strictly clamps to Open-Meteo's 1-16 range."""
        self.assertEqual(validate_forecast_days(0), 1)
        self.assertEqual(validate_forecast_days(-5), 1)
        self.assertEqual(validate_forecast_days(1), 1)
        self.assertEqual(validate_forecast_days(5), 5)
        self.assertEqual(validate_forecast_days(16), 16)
        self.assertEqual(validate_forecast_days(30), 16)
        self.assertEqual(validate_forecast_days(None, default=7), 7)
        self.assertEqual(validate_forecast_days("not_a_number", default=7), 7)

    def test_forecast_days_parsing_from_query(self):
        """Verify natural language queries extract appropriate forecast day counts."""
        self.assertEqual(parse_forecast_days_from_query("What is the current weather?"), 1)
        self.assertEqual(parse_forecast_days_from_query("What's the weather today?"), 1)
        self.assertEqual(parse_forecast_days_from_query("Is it raining right now?"), 1)
        self.assertEqual(parse_forecast_days_from_query("Will it rain tomorrow?"), 2)
        self.assertEqual(parse_forecast_days_from_query("Show me the 3-day weather forecast"), 3)
        self.assertEqual(parse_forecast_days_from_query("Give me the forecast for next 5 days"), 5)
        self.assertEqual(parse_forecast_days_from_query("Weather forecast this week"), 7)
        self.assertEqual(parse_forecast_days_from_query("What's the 14 day outlook?"), 14)
        self.assertEqual(parse_forecast_days_from_query("Can you give me 30 days weather?"), 16)

    # =========================================================================
    # 2. User Location Retrieval Tests
    # =========================================================================
    def test_user_location_retrieval_success(self):
        """Verify coordinates are accurately retrieved from user profile."""
        lat, lon, prof = get_user_coordinates(self.mock_profile_with_coords)
        self.assertAlmostEqual(lat, 18.5204, places=4)
        self.assertAlmostEqual(lon, 73.8567, places=4)
        self.assertEqual(prof.get("city"), "Pune")

    def test_missing_location_coordinates_handling(self):
        """Verify tool returns a clean error status when user coordinates are missing."""
        no_coord_profile = {
            "user_name": "TestUser",
            "city": "UnknownCity",
            "latitude": None,
            "longitude": None,
        }
        set_user_profile(no_coord_profile)

        result = get_weather_forecast(forecast_days=3, user_profile=no_coord_profile)
        self.assertEqual(result["status"], "missing_location")
        self.assertIn("not configured", result["message"].lower())
        self.assertIsNone(result["structured_data"])

        # Reset profile
        set_user_profile(self.mock_profile_with_coords)

    # =========================================================================
    # 3. Open-Meteo API Calling & Forecast Data Retrieval Tests
    # =========================================================================
    @patch("chat.workflow.weather_tool.requests.get")
    def test_open_meteo_api_call_parameters(self, mock_get):
        """Verify API call dynamically uses user coordinates, forecast duration, and timezone=auto."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = self.mock_open_meteo_response
        mock_get.return_value = mock_resp

        data = fetch_open_meteo_forecast(
            latitude=18.5204,
            longitude=73.8567,
            forecast_days=3,
            timezone="auto",
        )

        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        self.assertEqual(args[0], OPEN_METEO_FORECAST_URL)
        params = kwargs.get("params", {})
        self.assertEqual(params.get("latitude"), 18.5204)
        self.assertEqual(params.get("longitude"), 73.8567)
        self.assertEqual(params.get("forecast_days"), 3)
        self.assertEqual(params.get("timezone"), "auto")

        # Verify required parameters in current, hourly, and daily queries
        self.assertIn("temperature_2m", params.get("current", ""))
        self.assertIn("apparent_temperature", params.get("current", ""))
        self.assertIn("relative_humidity_2m", params.get("current", ""))
        self.assertIn("precipitation", params.get("current", ""))
        self.assertIn("rain", params.get("current", ""))
        self.assertIn("snowfall", params.get("current", ""))
        self.assertIn("weather_code", params.get("current", ""))
        self.assertIn("wind_speed_10m", params.get("current", ""))

        self.assertIn("precipitation_probability", params.get("hourly", ""))
        self.assertIn("precipitation_probability_max", params.get("daily", ""))

    # =========================================================================
    # 4. Structured Data & Text Formatting Tests
    # =========================================================================
    def test_weather_report_formatting(self):
        """Verify format_weather_report produces rich structured data and clean text."""
        structured, text = format_weather_report(
            self.mock_open_meteo_response,
            self.mock_profile_with_coords,
            requested_days=3,
        )

        # 1. Structured data checks
        self.assertIn("location", structured)
        self.assertEqual(structured["forecast_days"], 3)
        self.assertIn("current", structured)
        cur = structured["current"]
        self.assertEqual(cur["temperature_celsius"], 31.5)
        self.assertEqual(cur["apparent_temperature_celsius"], 30.2)
        self.assertEqual(cur["relative_humidity_percent"], 28)
        self.assertEqual(cur["condition"], "Clear sky")
        self.assertEqual(cur["wind_speed_kmh"], 12.5)

        # Daily checks
        self.assertIn("daily", structured)
        self.assertEqual(len(structured["daily"]), 3)
        day1 = structured["daily"][0]
        self.assertEqual(day1["temp_max_celsius"], 32.5)
        self.assertEqual(day1["temp_min_celsius"], 19.2)
        self.assertEqual(day1["precipitation_probability_percent"], 0)

        # Hourly highlights check
        self.assertIn("hourly_highlights", structured)
        self.assertTrue(len(structured["hourly_highlights"]) > 0)

        # 2. Text summary checks
        self.assertIn("Pune", text)
        self.assertIn("31.5°C", text)
        self.assertIn("Feels like 30.2°C", text)
        self.assertIn("Clear sky", text)
        self.assertIn("High: 32.5°C", text)

    # =========================================================================
    # 5. API Error Resilience Tests
    # =========================================================================
    @patch("chat.workflow.weather_tool.requests.get")
    def test_api_network_error_resilience(self, mock_get):
        """Verify HTTP 500 or network errors are handled gracefully without exceptions."""
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_resp.text = "Service Unavailable"
        mock_get.return_value = mock_resp

        result = get_weather_forecast(forecast_days=3, user_profile=self.mock_profile_with_coords)
        self.assertEqual(result["status"], "api_error")
        self.assertIn("could not be retrieved", result["summary_text"].lower())

    # =========================================================================
    # 6. Decision Node Intent Routing Tests
    # =========================================================================
    def test_decision_node_weather_intent_routing(self):
        """Verify weather queries route to 'weather' tool via heuristic and LLM."""
        weather_queries = [
            "What's the weather like today?",
            "Will it rain tomorrow?",
            "Give me the 5-day weather forecast",
            "What is the current temperature outside?",
            "Is it going to rain this evening?",
            "How hot is it outside right now?",
        ]
        for q in weather_queries:
            route, _ = _heuristic_fallback(q)
            self.assertEqual(route, "weather", f"Heuristic failed to route query: '{q}'")

    # =========================================================================
    # 7. LangGraph Workflow Node & End-to-End Chat Integration Tests
    # =========================================================================
    @patch("chat.workflow.weather_tool.requests.get")
    def test_weather_forecast_node_execution(self, mock_get):
        """Verify weather_forecast_node populates node_outputs and final_response."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = self.mock_open_meteo_response
        mock_get.return_value = mock_resp

        state: AgentState = {
            "user_query": "What is the weather today?",
            "chat_history": [],
            "user_profile": self.mock_profile_with_coords,
            "tool_parameters": {"forecast_days": 1},
        }

        result = weather_forecast_node(state)
        self.assertIn("node_outputs", result)
        self.assertIn("final_response", result)
        outputs = result["node_outputs"]
        self.assertEqual(outputs.get("executed_node"), "weather")
        self.assertIn("weather_response", outputs)
        self.assertIn("weather_data", outputs)
        self.assertIn("31.5°C", result["final_response"])

    async def test_end_to_end_weather_chat_workflow(self):
        """Verify full agentic LangGraph execution for a weather forecast query."""
        def mock_llm_handler(prompt, work="general"):
            if work == "decision":
                return (
                    '{\n'
                    '  "route": "weather",\n'
                    '  "reasoning": "User asking for current weather forecast",\n'
                    '  "is_follow_up": false,\n'
                    '  "can_answer_from_history": false,\n'
                    '  "detail_level": "concise",\n'
                    '  "resolved_query": "What is the weather today?",\n'
                    '  "retrieval_plan": {"forecast_days": 1}\n'
                    '}'
                )
            elif work == "synthesis":
                return "Hey Dhiraj! In Pune right now, it's clear sky with a temperature of 31.5°C (feels like 30.2°C). High today is 32.5°C with no rain expected!"
            return "OK"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = self.mock_open_meteo_response

        with patch("chat.workflow.decision_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.synthesis_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.weather_tool.requests.get", return_value=mock_resp):

            response = await run_chat_workflow(
                job_id="test-job-weather",
                session_id="test-session-weather",
                user_query="What's the weather like today?",
                chat_history=[],
                user_profile=self.mock_profile_with_coords,
            )

            self.assertTrue(len(response) > 0)
            self.assertIn("Pune", response)
            self.assertIn("31.5°C", response)


if __name__ == "__main__":
    unittest.main()
