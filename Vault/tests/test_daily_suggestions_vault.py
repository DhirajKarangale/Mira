import unittest
from fastapi.testclient import TestClient
import config_storage
from app import app


class TestDailySuggestionsVault(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_storage.init_config_storage()
        cls.client = TestClient(app)

    def test_schema_daily_suggestions(self):
        """Verify daily_suggestions table columns in schema."""
        tables = config_storage.parse_schema_file()
        self.assertIn("daily_suggestions", tables)
        cols = tables["daily_suggestions"]["columns"]
        self.assertIn("id", cols)
        self.assertIn("date_suggestions", cols)
        self.assertIn("suggestions", cols)
        self.assertIn("completed", cols)
        self.assertIn("date_weather", cols)
        self.assertIn("weather", cols)
        self.assertIn("date_news", cols)
        self.assertIn("news", cols)
        self.assertIn("date_music", cols)
        self.assertIn("music", cols)
        self.assertIn("date_entertainment", cols)
        self.assertIn("entertainment", cols)

    def test_save_and_retrieve_daily_suggestions(self):
        """Verify saving and retrieving daily suggestions."""
        payload = {
            "suggestions": ["Task A", "Task B", "Task C"],
            "weather": {"current": {"temperature_celsius": 25}, "suggestion": "Wear sunscreen"},
            "news": [{"title": "Headline 1", "summary": "Summary 1", "url": "https://example.com/1", "source": "BBC"}],
            "date_weather": "2026-10-26T12:00:00Z",
            "date_news": "2026-10-26T12:00:00Z",
            "date_suggestions": "2026-10-26T12:00:00Z",
        }
        saved = config_storage.save_daily_suggestions(payload)
        self.assertIsNotNone(saved.get("id"))
        self.assertEqual(saved.get("suggestions"), ["Task A", "Task B", "Task C"])
        self.assertEqual(saved.get("weather", {}).get("suggestion"), "Wear sunscreen")
        self.assertEqual(len(saved.get("news", [])), 1)

        # Retrieve via API
        resp = self.client.get("/daily_suggestions/latest")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("id"), saved["id"])
        self.assertEqual(data.get("suggestions"), ["Task A", "Task B", "Task C"])

    def test_completion_tracking_and_duplicate_prevention(self):
        """Verify completion state, duplicate index prevention, and index removal on uncheck."""
        # Reset completed to empty
        config_storage.save_daily_suggestions({"completed": []})

        # 1. Complete index 0
        r1 = config_storage.update_suggestion_completion(index=0, completed=True)
        self.assertIn(0, r1["completed"])

        # 2. Complete index 2
        r2 = config_storage.update_suggestion_completion(index=2, completed=True)
        self.assertIn(0, r2["completed"])
        self.assertIn(2, r2["completed"])

        # 3. Complete index 0 again - verify NO duplicate index
        r3 = config_storage.update_suggestion_completion(index=0, completed=True)
        self.assertEqual(r3["completed"].count(0), 1)
        self.assertEqual(r3["completed"], [0, 2])

        # 4. Uncheck index 0 - verify index is removed
        r4 = config_storage.update_suggestion_completion(index=0, completed=False)
        self.assertNotIn(0, r4["completed"])
        self.assertEqual(r4["completed"], [2])

        # 5. Check via API endpoint
        api_resp = self.client.post("/daily_suggestions/completed", json={"index": 1, "completed": True})
        self.assertEqual(api_resp.status_code, 200)
        self.assertEqual(api_resp.json()["completed"], [1, 2])


if __name__ == "__main__":
    unittest.main()
