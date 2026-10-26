import unittest
import uuid
from fastapi.testclient import TestClient
import config_storage
from app import app


class TestGNewsVault(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_storage.init_config_storage()
        cls.client = TestClient(app)

    def setUp(self):
        # Save initial state
        self.original_config = config_storage.get_gnews_config()

    def tearDown(self):
        # Restore initial state
        if self.original_config:
            config_storage.update_gnews_config(
                keys=self.original_config.get("keys", []),
                current_key=self.original_config.get("current_key", 0)
            )

    def test_schema_has_gnews_config_table(self):
        """Verify gnews_config table has id (UUID), current_key, and keys columns."""
        tables = config_storage.parse_schema_file()
        self.assertIn("gnews_config", tables)
        cols = tables["gnews_config"]["columns"]
        self.assertIn("id", cols)
        self.assertIn("current_key", cols)
        self.assertIn("keys", cols)

    def test_gnews_config_initial_seed_uuid(self):
        """Verify gnews_config has a valid UUID id and valid defaults."""
        cfg = config_storage.get_gnews_config()
        self.assertIn("id", cfg)
        # Should be a valid UUID
        parsed_uuid = uuid.UUID(cfg["id"])
        self.assertEqual(str(parsed_uuid), cfg["id"])
        self.assertIsInstance(cfg["keys"], list)
        self.assertIsInstance(cfg["current_key"], int)

    def test_add_and_update_keys(self):
        """Verify adding, updating, and selecting keys."""
        # Set 2 keys
        keys = ["test-key-alpha", "test-key-beta"]
        res = config_storage.update_gnews_config(keys=keys, current_key=1)
        self.assertEqual(res["keys"], keys)
        self.assertEqual(res["total_keys"], 2)
        self.assertEqual(res["current_key"], 1)

        # Retrieve again to verify persistence
        fetched = config_storage.get_gnews_config()
        self.assertEqual(fetched["keys"], keys)
        self.assertEqual(fetched["total_keys"], 2)
        self.assertEqual(fetched["current_key"], 1)

    def test_validation_rejects_negative_index(self):
        """Verify negative index is rejected with ValueError."""
        with self.assertRaises(ValueError):
            config_storage.update_gnews_config(
                keys=["key-1", "key-2"],
                current_key=-1
            )

    def test_validation_rejects_out_of_bounds_index(self):
        """Verify index >= total_keys is rejected with ValueError."""
        with self.assertRaises(ValueError):
            config_storage.update_gnews_config(
                keys=["key-1", "key-2"],
                current_key=2  # max index is 1
            )

    def test_empty_keys_handling(self):
        """Verify empty keys list resets or handles current_key gracefully."""
        res = config_storage.update_gnews_config(keys=[], current_key=0)
        self.assertEqual(res["keys"], [])
        self.assertEqual(res["total_keys"], 0)
        self.assertEqual(res["current_key"], 0)

        # Trying to set positive index on empty keys should fail
        with self.assertRaises(ValueError):
            config_storage.update_gnews_config(keys=[], current_key=1)

    def test_api_endpoints(self):
        """Verify HTTP endpoints for GNews config."""
        # 1. GET /news/config
        get_res = self.client.get("/news/config")
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertIn("id", data)
        self.assertIn("keys", data)
        self.assertIn("current_key", data)

        # 2. POST /news/config with valid data
        post_res = self.client.post("/news/config", json={
            "keys": ["api-key-1", "api-key-2", "api-key-3"],
            "current_key": 2
        })
        self.assertEqual(post_res.status_code, 200)
        post_data = post_res.json()
        self.assertEqual(post_data["total_keys"], 3)
        self.assertEqual(post_data["current_key"], 2)
        self.assertEqual(post_data["keys"], ["api-key-1", "api-key-2", "api-key-3"])

        # 3. POST /news/config with invalid index >= total_keys -> 400
        bad_res = self.client.post("/news/config", json={
            "current_key": 5
        })
        self.assertEqual(bad_res.status_code, 400)

        # 4. POST /news/config with negative index -> 400
        neg_res = self.client.post("/news/config", json={
            "current_key": -1
        })
        self.assertEqual(neg_res.status_code, 400)

        # 5. DELETE /news/config
        del_res = self.client.delete("/news/config")
        self.assertEqual(del_res.status_code, 200)
        after_del = self.client.get("/news/config").json()
        self.assertEqual(after_del["keys"], [])
        self.assertEqual(after_del["total_keys"], 0)
        self.assertEqual(after_del["current_key"], 0)


if __name__ == "__main__":
    unittest.main()
