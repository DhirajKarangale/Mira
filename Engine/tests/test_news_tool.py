from __future__ import annotations

import sys
import unittest
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
    fetch_news_from_gnews,
    format_articles_summary,
    news_node,
    GNEWS_TOP_HEADLINES_URL,
)
from chat.workflow.graph import get_registered_tools
from chat.workflow.decision_node import ACTIVE_ROUTE_TARGETS


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
        self.assertEqual(resolve_country_code("de"), "de")
        self.assertEqual(resolve_country_code(""), "us")
        self.assertEqual(resolve_country_code(None), "us")

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
        Verify that GNews request strictly includes country, lang, max, and apikey.
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

    def test_format_articles_summary(self):
        """Verify markdown summary formatting."""
        articles = [
            {
                "title": "Global Summit Begins",
                "source": {"name": "World News"},
                "description": "Leaders gathered to discuss key global priorities.",
                "url": "https://example.com/summit",
            }
        ]
        text = format_articles_summary(articles, "us")
        self.assertIn("Global Summit Begins", text)
        self.assertIn("World News", text)
        self.assertIn("https://example.com/summit", text)


if __name__ == "__main__":
    unittest.main()
