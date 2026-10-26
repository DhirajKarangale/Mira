from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure paths
_engine_dir = Path(__file__).resolve().parent.parent
_root_dir = _engine_dir.parent
for p in (_root_dir / "Vault", _root_dir / "Memory", _root_dir, _engine_dir):
    if str(p) in sys.path:
        sys.path.remove(str(p))
    sys.path.insert(0, str(p))

from chat.workflow.news_tool import (
    resolve_country_code,
    resolve_category,
    parse_date_range,
    plan_news_query,
    fetch_news_from_gnews,
    format_articles_summary,
    news_node,
    GNEWS_TOP_HEADLINES_URL,
    GNEWS_SEARCH_URL,
)
from chat.workflow.graph import get_registered_tools
from chat.workflow.decision_node import ACTIVE_ROUTE_TARGETS, _heuristic_fallback


class TestNewsTool(unittest.TestCase):

    def test_news_registered_in_graph_and_decision(self):
        """Verify news is registered in graph tools and active in decision node."""
        tools = get_registered_tools()
        self.assertIn("news", tools)
        self.assertIn("news", ACTIVE_ROUTE_TARGETS)

    def test_resolve_country_code(self):
        """Verify country mapping to ISO codes."""
        self.assertEqual(resolve_country_code("India"), "in")
        self.assertEqual(resolve_country_code("United States"), "us")
        self.assertEqual(resolve_country_code("United Kingdom"), "gb")
        self.assertEqual(resolve_country_code("Japan"), "jp")
        self.assertEqual(resolve_country_code("France"), "fr")
        self.assertEqual(resolve_country_code("de"), "de")
        self.assertEqual(resolve_country_code(""), "us")
        self.assertEqual(resolve_country_code(None), "us")

    def test_resolve_category(self):
        """Verify category aliases and validation."""
        self.assertEqual(resolve_category("tech"), "technology")
        self.assertEqual(resolve_category("technology"), "technology")
        self.assertEqual(resolve_category("ai"), "technology")
        self.assertEqual(resolve_category("business"), "business")
        self.assertEqual(resolve_category("finance"), "business")
        self.assertEqual(resolve_category("stocks"), "business")
        self.assertEqual(resolve_category("sports"), "sports")
        self.assertEqual(resolve_category("football"), "sports")
        self.assertEqual(resolve_category("entertainment"), "entertainment")
        self.assertEqual(resolve_category("health"), "health")
        self.assertEqual(resolve_category("science"), "science")
        self.assertEqual(resolve_category("world"), "world")
        self.assertEqual(resolve_category("politics"), "nation")
        self.assertIsNone(resolve_category("unknown_random_category"))

    def test_parse_date_range(self):
        """Verify parsing of relative date expressions into ISO 8601 UTC format."""
        ref_dt = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)

        # Yesterday
        f_y, t_y = parse_date_range("yesterday", ref_dt)
        self.assertEqual(f_y, "2026-10-25T00:00:00Z")
        self.assertEqual(t_y, "2026-10-25T23:59:59Z")

        # Past week (7 days)
        f_w, t_w = parse_date_range("past week", ref_dt)
        self.assertEqual(f_w, "2026-10-19T12:00:00Z")
        self.assertEqual(t_w, "2026-10-26T12:00:00Z")

        # Explicit ISO date range
        f_iso, t_iso = parse_date_range("2026-10-01 to 2026-10-15", ref_dt)
        self.assertEqual(f_iso, "2026-10-01T00:00:00Z")
        self.assertEqual(t_iso, "2026-10-15T23:59:59Z")

    def test_plan_news_query_trending(self):
        """Trending/broad headlines route to top-headlines."""
        plan = plan_news_query("what are the latest breaking news headlines?", {"country": "US"})
        self.assertEqual(plan["operation"], "top_headlines")
        self.assertEqual(plan["country"], "us")

    def test_plan_news_query_category(self):
        """Category inquiry without specific entities routes to top-headlines."""
        plan = plan_news_query("top technology news in India", {"country": "US"})
        self.assertEqual(plan["operation"], "top_headlines")
        self.assertEqual(plan["category"], "technology")
        self.assertEqual(plan["country"], "in")

    def test_plan_news_query_location_city(self):
        """City/region based query routes to search with location in query."""
        plan = plan_news_query("what is the news in Chicago?", {"country": "US"})
        self.assertEqual(plan["operation"], "search")
        self.assertIn("Chicago", plan["q"])
        self.assertEqual(plan["location"], "Chicago")

    def test_plan_news_query_date_ranges(self):
        """Date range query routes to search with ISO from/to."""
        plan = plan_news_query("SpaceX news from yesterday", {"country": "US"})
        self.assertEqual(plan["operation"], "search")
        self.assertIn("spacex", plan["q"].lower())
        self.assertIsNotNone(plan["from"])
        self.assertIsNotNone(plan["to"])

    def test_plan_news_query_limits_and_clamping(self):
        """Verify max article clamping (1-10) and query truncation (200 chars)."""
        long_query = "x" * 300
        llm_plan = {
            "operation": "search",
            "q": long_query,
            "max_results": 50,  # exceeds free plan limit
        }
        plan = plan_news_query("search news", {"country": "US"}, llm_plan=llm_plan)
        self.assertEqual(plan["max"], 10)  # clamped to 10
        self.assertLessEqual(len(plan["q"]), 200)

    def test_empty_keys_handling(self):
        """Verify empty key config returns informative message without network call."""
        with patch("chat.workflow.news_tool.get_gnews_config") as mock_cfg:
            mock_cfg.return_value = {"keys": [], "current_key": 0}
            res = fetch_news_from_gnews()
            self.assertFalse(res["success"])
            self.assertEqual(res["error"], "no_api_key")
            self.assertIn("Tools -> News", res["message"])

    def test_privacy_parameters_only_sent(self):
        """
        Verify that GNews request strictly includes allowed API parameters.
        Ensure NO personal data (user name, email, phone, location coordinates, activity) is sent.
        """
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "totalArticles": 1,
            "articles": [
                {
                    "title": "Major Tech Breakthrough Announced",
                    "description": "Researchers unveil breakthrough technology.",
                    "url": "https://example.com/tech-news",
                    "source": {"name": "Tech Daily"},
                    "publishedAt": "2026-10-26T12:00:00Z",
                }
            ]
        }

        with patch("requests.get", return_value=mock_resp) as mock_get:
            res = fetch_news_from_gnews(
                country="India",
                query="AI",
                api_key="gnews_secret_key_123"
            )

            self.assertTrue(res["success"])
            mock_get.assert_called_once()
            call_kwargs = mock_get.call_args[1]
            params = call_kwargs["params"]

            # Verify allowed parameters
            self.assertEqual(params["country"], "in")
            self.assertEqual(params["apikey"], "gnews_secret_key_123")
            self.assertEqual(params["lang"], "en")
            self.assertEqual(params["q"], "AI")
            self.assertIn("max", params)

            # Strict Privacy Check: None of the following personal keys must exist
            disallowed_keys = [
                "user_name", "user", "name", "email", "phone", "phone_number",
                "latitude", "longitude", "city", "state", "address", "postal_code",
                "screen_activity", "history"
            ]
            for dis in disallowed_keys:
                self.assertNotIn(dis, params)

    def test_key_rotation_on_429(self):
        """Verify automatic failover to the next configured key when primary hits 429 rate limit."""
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.text = "Rate limit exceeded"

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {
            "totalArticles": 1,
            "articles": [{"title": "Success Article", "url": "https://example.com/article"}]
        }

        with patch("chat.workflow.news_tool.get_gnews_config") as mock_cfg:
            mock_cfg.return_value = {"keys": ["key_rate_limited", "key_backup_working"], "current_key": 0}
            with patch("requests.get", side_effect=[resp_429, resp_200]) as mock_get:
                with patch("chat.workflow.news_tool.update_vault_active_key") as mock_update_vault:
                    res = fetch_news_from_gnews(country="us")
                    self.assertTrue(res["success"])
                    self.assertEqual(len(res["articles"]), 1)
                    self.assertEqual(mock_get.call_count, 2)
                    # Key 0 was attempted first, then key 1 succeeded
                    first_call_key = mock_get.call_args_list[0][1]["params"]["apikey"]
                    second_call_key = mock_get.call_args_list[1][1]["params"]["apikey"]
                    self.assertEqual(first_call_key, "key_rate_limited")
                    self.assertEqual(second_call_key, "key_backup_working")
                    # Vault active key updated to index 1
                    mock_update_vault.assert_called_once_with(1)

    def test_key_rotation_on_401(self):
        """Verify automatic failover to the next configured key when primary hits 401 unauthorized."""
        resp_401 = MagicMock()
        resp_401.status_code = 401
        resp_401.text = "Unauthorized"

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {
            "totalArticles": 1,
            "articles": [{"title": "Success Article 2", "url": "https://example.com/article2"}]
        }

        with patch("chat.workflow.news_tool.get_gnews_config") as mock_cfg:
            mock_cfg.return_value = {"keys": ["key_invalid", "key_valid"], "current_key": 0}
            with patch("requests.get", side_effect=[resp_401, resp_200]):
                with patch("chat.workflow.news_tool.update_vault_active_key"):
                    res = fetch_news_from_gnews(country="us")
                    self.assertTrue(res["success"])
                    self.assertEqual(len(res["articles"]), 1)

    def test_all_keys_exhausted_rate_limit(self):
        """Verify error message when all keys are rate limited."""
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.text = "Rate limit exceeded"

        with patch("chat.workflow.news_tool.get_gnews_config") as mock_cfg:
            mock_cfg.return_value = {"keys": ["key1", "key2"], "current_key": 0}
            with patch("requests.get", side_effect=[resp_429, resp_429]):
                res = fetch_news_from_gnews(country="us")
                self.assertFalse(res["success"])
                self.assertEqual(res["error"], "rate_limited")
                self.assertIn("rate limit exceeded on all configured keys", res["message"])

    def test_search_endpoint_execution(self):
        """Verify execution against GNews search endpoint with parameters."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "totalArticles": 2,
            "articles": [
                {"title": "Search Result 1", "url": "https://example.com/1"},
                {"title": "Search Result 2", "url": "https://example.com/2"},
            ]
        }

        with patch("requests.get", return_value=mock_resp) as mock_get:
            res = fetch_news_from_gnews(
                operation="search",
                q="Artificial Intelligence",
                from_date="2026-10-20T00:00:00Z",
                to_date="2026-10-26T00:00:00Z",
                sortby="relevance",
                in_fields="title,description",
                max_results=5,
                api_key="test_key"
            )

            self.assertTrue(res["success"])
            mock_get.assert_called_once()
            url_called = mock_get.call_args[0][0]
            params = mock_get.call_args[1]["params"]

            self.assertEqual(url_called, GNEWS_SEARCH_URL)
            self.assertEqual(params["q"], "Artificial Intelligence")
            self.assertEqual(params["from"], "2026-10-20T00:00:00Z")
            self.assertEqual(params["to"], "2026-10-26T00:00:00Z")
            self.assertEqual(params["sortby"], "relevance")
            self.assertEqual(params["in"], "title,description")
            self.assertEqual(params["max"], 5)

    def test_top_headlines_endpoint_execution(self):
        """Verify execution against GNews top-headlines endpoint."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "totalArticles": 1,
            "articles": [{"title": "Headline 1", "url": "https://example.com/h1"}]
        }

        with patch("requests.get", return_value=mock_resp) as mock_get:
            res = fetch_news_from_gnews(
                operation="top_headlines",
                category="business",
                country="gb",
                api_key="test_key"
            )

            self.assertTrue(res["success"])
            url_called = mock_get.call_args[0][0]
            params = mock_get.call_args[1]["params"]

            self.assertEqual(url_called, GNEWS_TOP_HEADLINES_URL)
            self.assertEqual(params["category"], "business")
            self.assertEqual(params["country"], "gb")

    def test_format_articles_summary(self):
        """Verify markdown summary formatting."""
        articles = [
            {
                "title": "Global Summit Begins",
                "source": {"name": "World News"},
                "description": "Leaders gathered to discuss key global priorities.",
                "url": "https://example.com/summit",
                "publishedAt": "2026-10-26T14:30:00Z",
            }
        ]
        text = format_articles_summary(articles, context_label="World | US")
        self.assertIn("Global Summit Begins", text)
        self.assertIn("World News", text)
        self.assertIn("https://example.com/summit", text)
        self.assertIn("Oct 26, 2026", text)

    def test_news_node_execution(self):
        """Verify end-to-end news_node execution with state."""
        mock_articles = [
            {
                "title": "Autonomous Tech Advance",
                "source": {"name": "Tech Times"},
                "description": "Advancements in autonomous systems announced.",
                "url": "https://example.com/autonomous",
                "publishedAt": "2026-10-26T10:00:00Z",
            }
        ]
        with patch("chat.workflow.news_tool.fetch_news_from_gnews") as mock_fetch:
            mock_fetch.return_value = {
                "success": True,
                "operation": "top_headlines",
                "total_articles": 1,
                "articles": mock_articles,
            }

            state = {
                "user_query": "Give me the latest tech headlines",
                "user_profile": {"country": "United States"},
                "tool_parameters": {
                    "news_plan": {
                        "operation": "top_headlines",
                        "category": "technology",
                        "country": "us",
                    }
                },
                "node_outputs": {},
            }

            result = news_node(state)
            self.assertIn("node_outputs", result)
            outputs = result["node_outputs"]
            self.assertIn("news_response", outputs)
            self.assertIn("news_articles", outputs)
            self.assertEqual(len(outputs["news_articles"]), 1)
            self.assertIn("Autonomous Tech Advance", outputs["news_response"])
            self.assertEqual(outputs["executed_node"], "news")

    def test_decision_node_heuristic_news(self):
        """Verify decision node heuristic fallback routes news queries."""
        route, reason = _heuristic_fallback("what are the latest news headlines?")
        self.assertEqual(route, "news")
        route2, reason2 = _heuristic_fallback("breaking news today")
        self.assertEqual(route2, "news")


if __name__ == "__main__":
    unittest.main()
