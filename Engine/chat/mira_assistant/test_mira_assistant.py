from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest

# Path setup: Ensure Engine is first so Engine's vault_logger is used
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

from Engine.chat.mira_assistant.safety import (
    is_deletion_command,
    validate_target_path,
)
from Engine.chat.mira_assistant.detection import (
    detect_mira_query,
    detect_mira_intent,
    is_mira_conversation_history,
    is_personal_activity_query,
)
from Engine.chat.mira_assistant.retrieval import (
    get_mira_knowledge_base_path,
    search_knowledge_base,
    inspect_project_source_file,
    retrieve_mira_context,
)
from Engine.chat.mira_assistant.executor import (
    verify_file_integrity,
    plan_and_execute_modification,
)
from Engine.chat.mira_assistant.guidance import generate_mira_guidance
from Engine.chat.mira_assistant.node import mira_assistant_node
from Engine.chat.workflow.decision_node import _fast_route_heuristic


class TestMIRAAssistantRouting(unittest.TestCase):
    """Test 1: Query Detection and Routing."""

    def test_mira_informational_detection(self):
        queries = [
            "What is MIRA?",
            "How does MIRA handle LLM failover from Gemini to Groq?",
            "What Redis streams are managed by the Message Broker?",
            "How does Vault use ChaCha20 encryption?",
            "Explain MIRA Operator screen capture in Rust",
        ]
        for q in queries:
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"Failed to detect MIRA query: '{q}'")
            route, reasoning, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("intent"), "INFORMATIONAL")

    def test_mira_modification_detection(self):
        queries = [
            "Add a new helper function in Engine/chat/config.py",
            "Create a new tool script in scripts/check_services.py",
            "Update the chat worker poll interval in Engine/chat/config.py",
            "Implement a new route in Engine/chat/router.py",
        ]
        for q in queries:
            match = detect_mira_query(q)
            self.assertIsNotNone(match, f"Failed to detect modification query: '{q}'")
            route, reasoning, params = match
            self.assertEqual(route, "mira_assistant")
            self.assertEqual(params.get("intent"), "MODIFICATION")

    def test_personal_activity_not_intercepted(self):
        """Must NOT hijack personal screen activity queries."""
        activity_queries = [
            "What did I do today?",
            "What was I doing at 3 PM?",
            "Summarize my screen activity between 9 AM and 5 PM",
            "Did I open VS Code yesterday?",
            "What was on my screen this morning?",
        ]
        for q in activity_queries:
            self.assertTrue(is_personal_activity_query(q), f"Should identify as personal activity: '{q}'")
            match = detect_mira_query(q)
            self.assertIsNone(match, f"Personal activity query should NOT route to MIRA assistant: '{q}'")

    def test_weather_and_news_not_intercepted(self):
        weather_q = "What is the weather forecast for tomorrow?"
        fast_res = _fast_route_heuristic(weather_q, [])
        self.assertIsNotNone(fast_res)
        self.assertEqual(fast_res[0], "weather")

        news_q = "What are the latest breaking tech news headlines?"
        fast_res = _fast_route_heuristic(news_q, [])
        self.assertIsNotNone(fast_res)
        self.assertEqual(fast_res[0], "news")

    def test_follow_up_detection(self):
        history = [
            {"role": "user", "content": "How does Engine chat route messages?"},
            {"role": "ai", "content": "Engine chat routes messages through decision_node to LangGraph tool nodes."},
        ]
        self.assertTrue(is_mira_conversation_history(history))
        follow_up = "Which file implements that?"
        match = detect_mira_query(follow_up, chat_history=history)
        self.assertIsNotNone(match)
        self.assertEqual(match[0], "mira_assistant")


class TestMIRAAssistantSafety(unittest.TestCase):
    """Test 2: Access & Safety - Deletion Restriction."""

    def test_prohibited_deletion_commands(self):
        prohibited = [
            "Delete file Engine/test.py",
            "Remove directory Vault/system/knowledge_base",
            "Drop database table chat_sessions",
            "Purge all user data and activity logs",
            "Wipe all chats from vault",
            "rmdir scripts/temp",
        ]
        for cmd in prohibited:
            is_del, explanation = is_deletion_command(cmd)
            self.assertTrue(is_del, f"Failed to block deletion: '{cmd}'")
            self.assertIn("Safety Restriction", explanation)

    def test_allowed_informational_about_deletion(self):
        """Questions asking HOW deletion works or WHERE it is implemented are allowed."""
        allowed = [
            "How do I delete a chat session in the UI?",
            "Where is delete implemented in Engine/chat/router.py?",
            "Explain how delete_all_sessions_from_vault works",
        ]
        for q in allowed:
            is_del, _ = is_deletion_command(q)
            self.assertFalse(is_del, f"Innocent question wrongly flagged as deletion: '{q}'")

    def test_path_traversal_blocked(self):
        is_ok, target, err = validate_target_path("../../outside.py")
        self.assertFalse(is_ok)
        self.assertIn("outside", err.lower())

    def test_protected_path_blocked(self):
        is_ok, target, err = validate_target_path(".git/config")
        self.assertFalse(is_ok)
        self.assertIn("protected", err.lower())


class TestMIRAAssistantRetrieval(unittest.TestCase):
    """Test 3: Knowledge Base Retrieval & Source File Inspection."""

    def test_knowledge_base_path_discovery(self):
        kb_path = get_mira_knowledge_base_path()
        self.assertIsNotNone(kb_path, "Should locate MIRA knowledge base")
        self.assertTrue(kb_path.exists())

    def test_source_file_inspection(self):
        info = inspect_project_source_file("Engine/chat/config.py", max_lines=30)
        self.assertIsNotNone(info)
        self.assertEqual(info["filename"], "config.py")
        self.assertIn("CONSUMER_KEY_LLM_CHAT", info["raw_content"])

    def test_retrieve_mira_context(self):
        ctx = retrieve_mira_context("Engine chat router architecture", kb_limit=2)
        self.assertIn("kb_hits", ctx)
        self.assertIn("inspected_files", ctx)


class TestMIRAAssistantExecution(unittest.TestCase):
    """Test 4: Non-Destructive Project Modification & Verification."""

    def test_verify_file_integrity_valid_python(self):
        test_file = _REPO_ROOT / "Engine" / "chat" / "config.py"
        ok, msg = verify_file_integrity(test_file)
        self.assertTrue(ok)
        self.assertIn("successfully", msg.lower())

    def test_execution_deletion_blocked(self):
        result = plan_and_execute_modification("Delete file Engine/chat/test.py")
        self.assertFalse(result.success)
        self.assertEqual(result.error, "DELETION_PROHIBITED")
        self.assertIn("Safety Restriction", result.details)

    def test_non_destructive_file_creation_and_syntax_verification(self):
        scratch_rel = "Engine/chat/mira_assistant/_scratch_test_target.py"
        scratch_abs = _REPO_ROOT / scratch_rel
        
        # Write valid Python file
        scratch_abs.write_text("# Scratch test\ndef test_add(a: int, b: int) -> int:\n    return a + b\n", encoding="utf-8")
        self.assertTrue(scratch_abs.exists())

        ok, msg = verify_file_integrity(scratch_abs)
        self.assertTrue(ok)

        # Clean scratch file safely for test
        scratch_abs.write_text("# Archived test\n", encoding="utf-8")


class TestMIRAAssistantNodeIntegration(unittest.TestCase):
    """Test 5: LangGraph Node Integration."""

    def test_mira_node_informational(self):
        state = {
            "job_id": "test_job_1",
            "session_id": "test_session_1",
            "user_query": "What is MIRA and what are its four pillars?",
            "chat_history": [],
            "user_profile": {"user_name": "Developer"},
            "tool_parameters": {"intent": "INFORMATIONAL"},
            "node_outputs": {},
        }
        res = mira_assistant_node(state)
        self.assertIn("final_response", res)
        self.assertIn("node_outputs", res)
        self.assertEqual(res["node_outputs"]["executed_node"], "mira_assistant")
        self.assertIn("Memory", res["final_response"])


if __name__ == "__main__":
    unittest.main()
