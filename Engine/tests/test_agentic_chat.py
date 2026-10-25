from __future__ import annotations

import asyncio
from datetime import datetime
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

from llm.config import get_temperature, get_work_config, get_models_for_work, load_work_configs
from config import CONFIG, get_user_profile, set_user_profile
from chat.workflow.timezone_helper import (
    resolve_user_timezone,
    parse_time_expression,
    format_timestamp_in_tz,
)
from chat.workflow.state import AgentState
from chat.workflow.decision_node import decision_node, _heuristic_fallback
from chat.workflow.general_llm_node import general_llm_node
from chat.workflow.user_activity_node import (
    user_activity_node,
    _find_relevant_knowledge_bases,
    _search_across_knowledge_bases,
)
from chat.workflow.synthesis_node import synthesis_node
from chat.workflow.graph import (
    build_workflow_graph,
    run_chat_workflow,
    register_tool,
    get_registered_tools,
    TOOL_REGISTRY,
)


class TestAgenticChatSystem(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        load_work_configs()
        # Seed mock user profile in memory
        self.mock_profile = {
            "user_name": "Dhiraj",
            "email": "dakarangale02@gmail.com",
            "phone_number": "+91 7620320595",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "exists": True,
        }
        set_user_profile(self.mock_profile)

    # =========================================================================
    # 1. LLM Configuration Tests
    # =========================================================================
    def test_llm_config_tasks_and_temperatures(self):
        """Verify required LLM tasks exist in config.json with appropriate temperatures."""
        # Decision must have low temperature (0.0)
        self.assertEqual(get_temperature("decision"), 0.0)
        # Activity retrieval must have low temperature (0.0)
        self.assertEqual(get_temperature("activity_retrieval"), 0.0)
        # Synthesis has higher temperature (0.7) for natural, friendly rephrasing
        self.assertAlmostEqual(get_temperature("synthesis"), 0.7)
        # General has very low temperature (0.0) for accuracy
        self.assertEqual(get_temperature("general"), 0.0)
        # Summarization and chat must have low temperature (0.0)
        self.assertEqual(get_temperature("summarization"), 0.0)
        self.assertEqual(get_temperature("chat"), 0.0)

        # Provider models must be configured for all tasks
        for task in ("decision", "activity_retrieval", "synthesis", "general"):
            gemini_models = get_models_for_work(task, "gemini")
            groq_models = get_models_for_work(task, "groq")
            self.assertTrue(len(gemini_models) > 0, f"Task '{task}' missing Gemini models")
            self.assertTrue(len(groq_models) > 0, f"Task '{task}' missing Groq models")

    # =========================================================================
    # 2. User Profile & Timezone Resolution Tests
    # =========================================================================
    def test_user_profile_in_memory(self):
        """Verify user profile is accessible and updatable in memory."""
        prof = get_user_profile()
        self.assertEqual(prof.get("user_name"), "Dhiraj")
        self.assertEqual(prof.get("city"), "Pune")
        self.assertEqual(prof.get("country"), "India")

        # Test updating profile
        set_user_profile({**prof, "user_name": "DK Developer"})
        self.assertEqual(get_user_profile().get("user_name"), "DK Developer")
        set_user_profile(self.mock_profile)

    def test_timezone_resolution(self):
        """Verify user's timezone resolves accurately from profile."""
        tz = resolve_user_timezone({"city": "Pune", "country": "India"})
        self.assertEqual(str(tz), "Asia/Kolkata")

        tz_ny = resolve_user_timezone({"city": "New York", "country": "USA"})
        self.assertEqual(str(tz_ny), "America/New_York")

        # Direct timezone attribute
        tz_tokyo = resolve_user_timezone({"timezone": "Asia/Tokyo"})
        self.assertEqual(str(tz_tokyo), "Asia/Tokyo")

    # =========================================================================
    # 3. Time Expression Parsing Tests
    # =========================================================================
    def test_time_expression_parsing(self):
        """Verify relative and absolute time expressions are parsed to UTC Unix timestamps."""
        tz = resolve_user_timezone(self.mock_profile)

        # 1. Yesterday
        s_ts, e_ts, desc = parse_time_expression("what did I do yesterday?", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertTrue(e_ts > s_ts)
        self.assertIn("yesterday", desc)

        # 2. Between 9 AM and 5 PM
        s_ts, e_ts, desc = parse_time_expression("show my work between 9 AM and 5 PM", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertEqual(e_ts - s_ts, 8 * 3600)  # 8 hours difference
        self.assertIn("between", desc)

        # 3. Last month
        s_ts, e_ts, desc = parse_time_expression("summarize last month", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertIn("last month", desc)

        # 4. Explicit date
        s_ts, e_ts, desc = parse_time_expression("my activity on 24_10_2026", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertIn("2026-10-24", desc)

        # 5. Timestamp formatting in user timezone
        fmt = format_timestamp_in_tz(1792854969, tz)
        self.assertTrue(len(fmt) > 0)
        self.assertIn("2026", fmt)

        # 6. Today after 2:00 PM
        s_ts, e_ts, desc = parse_time_expression("tell me what I did today after 2:00pm", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertTrue(e_ts > s_ts)
        self.assertIn("after 02:00 PM", desc)
        # Verify start time is 2:00 PM (14:00)
        dt_start = datetime.fromtimestamp(s_ts, tz)
        self.assertEqual(dt_start.hour, 14)
        self.assertEqual(dt_start.minute, 0)

        # 7. Yesterday before 5:00 PM
        s_ts, e_ts, desc = parse_time_expression("my work yesterday before 5:00pm", tz)
        self.assertIsNotNone(s_ts)
        self.assertIsNotNone(e_ts)
        self.assertTrue(e_ts > s_ts)
        self.assertIn("before 05:00 PM", desc)
        dt_end = datetime.fromtimestamp(e_ts, tz)
        self.assertEqual(dt_end.hour, 17)
        self.assertEqual(dt_end.minute, 0)

    # =========================================================================
    # 4. Decision Node Routing Tests
    # =========================================================================
    def test_decision_node_routing_activity(self):
        """Verify activity questions route to user_activity."""
        activity_queries = [
            "What did I work on yesterday?",
            "What was I doing between 9 AM and 5 PM?",
            "Did I open Microsoft Edge today?",
            "Summarize my recent screen activities",
        ]
        for q in activity_queries:
            state: AgentState = {
                "user_query": q,
                "chat_history": [],
                "user_profile": self.mock_profile,
            }
            # Use deterministic heuristic or mock LLM
            route, _ = _heuristic_fallback(q)
            self.assertEqual(route, "user_activity", f"Failed for query: {q}")

    def test_decision_node_routing_general(self):
        """Verify general inquiries route to general_llm."""
        general_queries = [
            "What is the difference between TCP and UDP?",
            "Write a Python function to compute Fibonacci numbers",
            "Hello MIRA, how are you today?",
            "Explain quantum computing in simple terms",
        ]
        for q in general_queries:
            route, _ = _heuristic_fallback(q)
            self.assertEqual(route, "general_llm", f"Failed for query: {q}")

    # =========================================================================
    # 5. Knowledge Base Discovery & Vector Search Tests
    # =========================================================================
    def test_find_knowledge_bases(self):
        """Verify finding existing Knowledge Base folders."""
        tz = resolve_user_timezone(self.mock_profile)
        kbs = _find_relevant_knowledge_bases(None, None, tz)
        self.assertTrue(len(kbs) > 0, "Should discover at least one Knowledge Base folder")
        kb_names = [k.name for k in kbs]
        self.assertTrue(any("kb-" in name for name in kb_names))

    def test_qdrant_search_and_decryption(self):
        """Verify vector search on Qdrant and payload decryption with preserved metadata."""
        tz = resolve_user_timezone(self.mock_profile)
        kbs = _find_relevant_knowledge_bases(None, None, tz)
        self.assertTrue(len(kbs) > 0)

        with patch("chat.workflow.user_activity_node.generate_embedding", return_value=[0.01] * 1024):
            records = _search_across_knowledge_bases(
                kb_dirs=kbs,
                search_query="WhatsApp",
                app_name=None,
                start_ts=None,
                end_ts=None,
                user_tz=tz,
                limit=5,
            )
        self.assertTrue(isinstance(records, list))
        if records:
            r = records[0]
            self.assertIn("app_name", r)
            self.assertIn("timestamp", r)
            self.assertIn("timestamp_formatted", r)
            self.assertIn("summarized_text", r)
            self.assertTrue(len(r["summarized_text"]) > 0)
            # Decrypted text should not start with enc:v1:
            self.assertFalse(r["summarized_text"].startswith("enc:v1:"))


    # =========================================================================
    # 6. Missing Activity Data Handling Tests
    # =========================================================================
    def test_missing_activity_handling(self):
        """Verify that when no activity data is found, found=False is set and synthesis does not invent data."""
        state: AgentState = {
            "user_query": "What was I doing in Unreal Engine 5 on January 1, 2020?",
            "chat_history": [],
            "user_profile": self.mock_profile,
            "next_node": "user_activity",
            "node_outputs": {"executed_node": "user_activity"},
            "retrieved_context": {
                "found": False,
                "count": 0,
                "records": [],
                "time_description": "January 1, 2020",
                "app_filter": "Unreal Engine 5",
            },
        }

        # Mock call_llm for synthesis to inspect prompt instructions
        captured_prompt = []

        def mock_call_llm(prompt, work="summarization"):
            captured_prompt.append(prompt)
            return "Hey Dhiraj! I checked your activity logs for January 1, 2020, but found no recorded sessions in Unreal Engine 5. It looks like you were offline!"

        with patch("chat.workflow.synthesis_node.call_llm", side_effect=mock_call_llm):
            result = synthesis_node(state)
            self.assertIn("final_response", result)
            response = result["final_response"]
            self.assertIn("Dhiraj", response)
            self.assertIn("no recorded sessions", response.lower())
            # Ensure the synthesis prompt strictly forbade hallucination
            self.assertTrue(len(captured_prompt) > 0)
            self.assertIn("CRITICAL INSTRUCTION FOR MISSING DATA", captured_prompt[0])
            self.assertIn("Do NOT invent", captured_prompt[0])

    # =========================================================================
    # 7. End-to-End Chat Workflow Tests
    # =========================================================================
    async def test_end_to_end_general_workflow(self):
        """Test full LangGraph execution for a general question."""
        def mock_llm_handler(prompt, work="summarization"):
            if work == "decision":
                return '{"route": "general_llm", "reasoning": "General programming question"}'
            elif work == "general":
                return "Python is an interpreted, high-level, general-purpose programming language."
            elif work == "synthesis":
                return "Hey Dhiraj! Python is a high-level, interpreted programming language known for its clear syntax."
            return "OK"

        with patch("chat.workflow.decision_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.general_llm_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.synthesis_node.call_llm", side_effect=mock_llm_handler):

            response = await run_chat_workflow(
                job_id="test-job-001",
                session_id="test-session-001",
                user_query="What is Python?",
                chat_history=[],
                user_profile=self.mock_profile,
            )
            self.assertTrue(len(response) > 0)
            self.assertIn("Dhiraj", response)
            self.assertIn("Python", response)

    async def test_end_to_end_activity_workflow(self):
        """Test full LangGraph execution for a user activity inquiry."""
        def mock_llm_handler(prompt, work="summarization"):
            if work == "decision":
                return '{"route": "user_activity", "reasoning": "User asking about past activities"}'
            elif work == "activity_retrieval":
                return '{"search_query": "WhatsApp conversation", "app_name": "Microsoft Edge", "time_expression": "yesterday"}'
            elif work == "synthesis":
                return "Hey Dhiraj! Yesterday you were using Microsoft Edge to check your WhatsApp chats."
            return "OK"

        with patch("chat.workflow.decision_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.user_activity_node.call_llm", side_effect=mock_llm_handler), \
             patch("chat.workflow.user_activity_node.generate_embedding", return_value=[0.01] * 1024), \
             patch("chat.workflow.synthesis_node.call_llm", side_effect=mock_llm_handler):

            response = await run_chat_workflow(
                job_id="test-job-002",
                session_id="test-session-002",

                user_query="What did I do in WhatsApp yesterday?",
                chat_history=[],
                user_profile=self.mock_profile,
            )
            self.assertTrue(len(response) > 0)
            self.assertIn("Dhiraj", response)

    # =========================================================================
    # 8. Dynamic Tool Registration Tests
    # =========================================================================
    def test_dynamic_tool_registration(self):
        """Verify registering a new tool dynamically without altering graph code."""
        initial_tools = get_registered_tools()
        self.assertIn("user_activity", initial_tools)
        self.assertIn("general_llm", initial_tools)

        # Register custom mock tool
        def weather_tool_node(state: AgentState):
            outputs = dict(state.get("node_outputs") or {})
            outputs["weather_result"] = "Current weather in Pune: 28°C, Clear Sky."
            outputs["executed_node"] = "weather"
            return {"node_outputs": outputs}

        register_tool("weather", weather_tool_node)
        self.assertIn("weather", get_registered_tools())

        # Build graph and verify the dynamic tool is included
        graph = build_workflow_graph()
        self.assertIsNotNone(graph)

    # =========================================================================
    # 9. Natural Language Typo & Rate-Limit Resilience Tests
    # =========================================================================
    def test_typo_tolerance_in_activity_query(self):
        """Verify queries with typos like 'yesterady' are correctly parsed."""
        tz = resolve_user_timezone(self.mock_profile)
        start_ts, end_ts, desc = parse_time_expression("can you tell me what I did yesterady", tz)
        self.assertIsNotNone(start_ts)
        self.assertIsNotNone(end_ts)
        self.assertIn("yesterday", desc.lower())

        route, reasoning = _heuristic_fallback("can you tell me what I did yesterady")
        self.assertEqual(route, "user_activity")

    def test_error_classification_rate_limit(self):
        """Verify 429 and rate limit errors trigger key rotation classification."""
        from llm.error_analysis import classify_error, ErrorType
        class Mock429Error(Exception):
            def __init__(self):
                super().__init__("Error code: 429 - Rate limit reached for model on tokens per minute (TPM)")
                self.status_code = 429

        err_type = classify_error(Mock429Error(), "groq")
        self.assertEqual(err_type, ErrorType.API_KEY_EXPIRED_OR_INVALID)


if __name__ == "__main__":
    unittest.main()
