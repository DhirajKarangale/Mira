from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

# Ensure project paths are cleanly configured in sys.path
_REPO_ROOT = Path(__file__).resolve().parents[3]
_paths = [
    _REPO_ROOT / "Engine",
    _REPO_ROOT,
    _REPO_ROOT / "Vault",
    _REPO_ROOT / "Memory",
]
for p in reversed(_paths):
    p_str = str(p)
    if p_str in sys.path:
        sys.path.remove(p_str)
    sys.path.insert(0, p_str)

from Engine.chat.mira_assistant.detection import (
    detect_mira_query,
    is_mira_operational_query,
    is_personal_activity_query,
)
from Engine.chat.mira_assistant.operations import (
    execute_mira_operation,
    handle_daily_suggestions_op,
    handle_api_key_op,
    handle_config_op,
    handle_streams_and_services_op,
    handle_database_op,
    _mask_key,
)
from Engine.chat.mira_assistant.node import mira_assistant_node
from Engine.chat.workflow.decision_node import _fast_route_heuristic


class TestMIRAOperationsDetection(unittest.TestCase):
    """Test detection and classification of MIRA operational queries."""

    def test_daily_suggestions_detection(self):
        queries = [
            "What are my daily suggestions?",
            "Show my daily suggestions checklist",
            "give me list of suggestions here",
            "give me suggestions",
            "list of suggestions",
            "show suggestions",
            "refresh daily suggestions",
            "generate daily suggestions now",
            "mark suggestion 1 as completed",
            "check off daily suggestion 2",
            "show daily suggestions history",
        ]
        for q in queries:
            op_info = is_mira_operational_query(q)
            self.assertIsNotNone(op_info, f"Query '{q}' should be recognized as an operational query.")
            cat, act = op_info
            self.assertEqual(cat, "DAILY_SUGGESTIONS")
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"detect_mira_query failed on '{q}'")
            route, _, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("op_category"), "DAILY_SUGGESTIONS")

    def test_api_keys_detection(self):
        queries = [
            "What API keys do I have configured?",
            "Show all my LLM API keys",
            "add keys",
            "add key",
            "add elevenlabs key",
            "update gemini api key to AIzaSyTestKey12345",
            "set groq api key to gsk_test1234567890",
            "change AI failover priority to groq, gemini",
        ]
        for q in queries:
            op_info = is_mira_operational_query(q)
            self.assertIsNotNone(op_info, f"Query '{q}' should be recognized as an operational query.")
            cat, act = op_info
            self.assertEqual(cat, "API_KEYS")
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"detect_mira_query failed on '{q}'")
            route, _, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("op_category"), "API_KEYS")

    def test_config_detection(self):
        queries = [
            "Show my user profile configuration",
            "Update my user role to Senior Engineer",
            "Show engine worker configuration",
            "Inspect application screen capture permissions",
            "Add Chrome to allowed apps whitelist",
        ]
        for q in queries:
            op_info = is_mira_operational_query(q)
            self.assertIsNotNone(op_info, f"Query '{q}' should be recognized as an operational query.")
            cat, act = op_info
            self.assertEqual(cat, "CONFIGURATIONS")
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"detect_mira_query failed on '{q}'")
            route, _, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("op_category"), "CONFIGURATIONS")

    def test_streams_and_services_detection(self):
        queries = [
            "Check Redis stream status",
            "Inspect Redis streams",
            "Are MIRA microservices running?",
            "What is the length of stream:operator_screen?",
        ]
        for q in queries:
            op_info = is_mira_operational_query(q)
            self.assertIsNotNone(op_info, f"Query '{q}' should be recognized as an operational query.")
            cat, act = op_info
            self.assertEqual(cat, "STREAMS_AND_SERVICES")
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"detect_mira_query failed on '{q}'")
            route, _, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("op_category"), "STREAMS_AND_SERVICES")

    def test_database_detection(self):
        queries = [
            "Show database tables and counts",
            "Inspect Vault database storage",
            "How many chat messages are stored in sqlite?",
        ]
        for q in queries:
            op_info = is_mira_operational_query(q)
            self.assertIsNotNone(op_info, f"Query '{q}' should be recognized as an operational query.")
            cat, act = op_info
            self.assertEqual(cat, "DATABASES")
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"detect_mira_query failed on '{q}'")
            route, _, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("op_category"), "DATABASES")

    def test_personal_activity_not_hijacked(self):
        """Must never treat personal screen activity as a MIRA operation."""
        activity_queries = [
            "What did I do today?",
            "What was I doing at 3 PM?",
            "Summarize my screen activity between 9 AM and 5 PM",
            "Did I open VS Code yesterday?",
            "What was on my screen this morning?",
        ]
        for q in activity_queries:
            self.assertTrue(is_personal_activity_query(q))
            op_info = is_mira_operational_query(q)
            self.assertIsNone(op_info, f"Personal query '{q}' falsely marked as operational.")
            match = detect_mira_query(q)
            self.assertIsNone(match, f"Personal activity query '{q}' should NOT route to MIRA assistant.")


class TestMIRAOperationsExecution(unittest.TestCase):
    """Test direct execution of operational handlers."""

    def test_mask_key_utility(self):
        self.assertEqual(_mask_key(None), "(not set)")
        self.assertEqual(_mask_key(""), "(not set)")
        self.assertEqual(_mask_key("short"), "***")
        masked = _mask_key("AIzaSyCG_TestKey1234567890abcdef")
        self.assertTrue(masked.startswith("AIzaSy"))
        self.assertTrue(masked.endswith("cdef"))
        self.assertIn("...", masked)
        self.assertNotIn("TestKey1234567890", masked)

    def test_daily_suggestions_view(self):
        output = handle_daily_suggestions_op("What are my daily suggestions?", {"op_action": "view"})
        self.assertIsInstance(output, str)
        self.assertIn("Daily Suggestions", output)
        self.assertTrue(("[ ]" in output or "[x]" in output or "No suggestions" in output or "Daily Suggestions" in output))

    def test_daily_suggestions_refresh(self):
        output = handle_daily_suggestions_op("refresh daily suggestions", {"op_action": "refresh"})
        self.assertIsInstance(output, str)
        self.assertTrue("refreshed" in output.lower() or "suggestions" in output.lower() or "checklist" in output.lower())

    def test_daily_suggestions_complete_toggle(self):
        output = handle_daily_suggestions_op("mark suggestion 1 as completed", {"op_action": "complete"})
        self.assertIsInstance(output, str)
        self.assertTrue("suggestion" in output.lower() or "marked" in output.lower() or "active" in output.lower())

    def test_daily_suggestions_history(self):
        output = handle_daily_suggestions_op("show daily suggestions history", {"op_action": "history"})
        self.assertIsInstance(output, str)
        self.assertTrue("history" in output.lower() or "past" in output.lower())

    def test_api_keys_list(self):
        output = handle_api_key_op("What API keys do I have?", {"op_action": "list"})
        self.assertIsInstance(output, str)
        self.assertIn("Configured API Keys & Credentials", output)
        self.assertIn("Gemini", output)
        self.assertIn("Groq", output)
        self.assertNotIn("AQ.Ab8f", output)

    def test_api_keys_update_and_restore(self):
        test_val = "AIzaSyTestUnitOperationKey9999"
        update_out = handle_api_key_op(f"set gemini api key to {test_val}", {"op_action": "update"})
        self.assertTrue("API Key" in update_out or "Updated" in update_out)
        self.assertIn("AIzaSy", update_out)
        self.assertIn("9999", update_out)
        self.assertNotIn(test_val, update_out)

        list_out = handle_api_key_op("list api keys", {"op_action": "list"})
        self.assertIn("Gemini", list_out)
        self.assertNotIn(test_val, list_out)

        # Cleanup dummy key
        try:
            import config_storage
            gem = config_storage.get_ai_config("gemini")
            clean_keys = [k for k in gem.get("keys", []) if not k.endswith("9999")]
            config_storage.update_ai_config("gemini", keys=clean_keys)
        except Exception:
            pass

    def test_api_keys_priority_reorder(self):
        output = handle_api_key_op("set ai priority to groq, gemini", {"op_action": "priority"})
        self.assertTrue("Failover Order" in output or "Active AI Provider" in output)
        self.assertIn("groq", output)
        self.assertIn("gemini", output)

    def test_config_profile_read(self):
        output = handle_config_op("show user profile", None)
        self.assertIsInstance(output, str)
        self.assertIn("User Profile", output)

    def test_config_profile_update(self):
        output = handle_config_op("update user role to Lead Architect", None)
        self.assertIsInstance(output, str)
        self.assertTrue("Updated" in output or "User Profile" in output)

    def test_config_engine_read(self):
        output = handle_config_op("show engine worker configuration", None)
        self.assertIsInstance(output, str)
        self.assertIn("Engine Worker Configuration", output)

    def test_config_permissions_read(self):
        output = handle_config_op("show app permissions", None)
        self.assertIsInstance(output, str)
        self.assertIn("Capture Permissions", output)

    def test_streams_and_services_inspection(self):
        output = handle_streams_and_services_op("inspect redis streams and services")
        self.assertIsInstance(output, str)
        self.assertIn("Live Telemetry & Redis Stream Status", output)
        self.assertTrue("stream:" in output or "Redis" in output)

    def test_database_inspection(self):
        output = handle_database_op("show database tables and counts")
        self.assertIsInstance(output, str)
        self.assertIn("Database & Vector Storage Status", output)
        self.assertIn("Chat Sessions", output)
        self.assertIn("Vault Database", output)

    def test_execute_mira_operation_dispatcher(self):
        categories = [
            ("DAILY_SUGGESTIONS", "view", "What are my daily suggestions?"),
            ("API_KEYS", "list", "What API keys do I have?"),
            ("CONFIGURATIONS", "view", "show user profile"),
            ("STREAMS_AND_SERVICES", "view", "inspect redis streams"),
            ("DATABASES", "view", "show database status"),
        ]
        for cat, act, q in categories:
            res = execute_mira_operation(cat, act, q)
            self.assertIsNotNone(res)
            self.assertIsInstance(res, str)
            self.assertTrue(len(res) > 20, f"Result for category '{cat}' was unexpectedly short.")


class TestMIRAAssistantFastHeuristicAndNode(unittest.TestCase):
    """Test fast routing heuristic and node execution integration."""

    def test_fast_route_heuristic_routes_daily_suggestions(self):
        res = _fast_route_heuristic("What are my daily suggestions?", [])
        self.assertIsNotNone(res)
        route, reason, params = res
        self.assertEqual(route, "mira_assistant")
        self.assertEqual(params.get("op_category"), "DAILY_SUGGESTIONS")

    def test_fast_route_heuristic_routes_api_keys(self):
        res = _fast_route_heuristic("What API keys do I have?", [])
        self.assertIsNotNone(res)
        route, reason, params = res
        self.assertEqual(route, "mira_assistant")
        self.assertEqual(params.get("op_category"), "API_KEYS")

    def test_fast_route_heuristic_routes_stream_telemetry(self):
        res = _fast_route_heuristic("inspect redis streams", [])
        self.assertIsNotNone(res)
        route, reason, params = res
        self.assertEqual(route, "mira_assistant")
        self.assertEqual(params.get("op_category"), "STREAMS_AND_SERVICES")

    def test_mira_assistant_node_executes_operation(self):
        state = {
            "user_query": "What are my daily suggestions?",
            "messages": [],
            "tool_parameters": {
                "intent": "INFORMATIONAL",
                "op_category": "DAILY_SUGGESTIONS",
                "op_action": "view",
            },
            "node_outputs": {},
        }
        res_state = mira_assistant_node(state)
        self.assertIn("node_outputs", res_state)
        outputs = res_state["node_outputs"]
        self.assertIn("mira_operation", outputs)
        self.assertEqual(outputs["mira_operation"]["category"], "DAILY_SUGGESTIONS")
        self.assertIn("Daily Suggestions", res_state.get("final_response", ""))


if __name__ == "__main__":
    unittest.main()
