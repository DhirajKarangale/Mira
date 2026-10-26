from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional
from langgraph.graph import StateGraph, START, END

from .state import AgentState
from .decision_node import decision_node
from .general_llm_node import general_llm_node
from .user_activity_node import user_activity_node
from .history_node import history_node
from .synthesis_node import synthesis_node
from .weather_tool import weather_forecast_node
from .timezone_helper import resolve_user_timezone
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.graph")

# Dynamic Tool Node Registry: maps tool name to node function
# Additional tools (browser automation, weather, news) can be registered dynamically
TOOL_REGISTRY: Dict[str, Callable[[AgentState], Dict[str, Any]]] = {
    "user_activity": user_activity_node,
    "history_answer": history_node,
    "general_llm": general_llm_node,
    "weather": weather_forecast_node,
}

_COMPILED_GRAPH: Optional[Any] = None


def register_tool(name: str, node_func: Callable[[AgentState], Dict[str, Any]]) -> None:
    """
    Dynamically registers a new tool node into the workflow graph without
    requiring architecture redesign.
    """
    global _COMPILED_GRAPH
    clean_name = name.strip().lower()
    TOOL_REGISTRY[clean_name] = node_func
    # Invalidate cached compiled graph so next invocation rebuilds with the new tool
    _COMPILED_GRAPH = None
    log(f"[WorkflowGraph] Dynamically registered tool node: '{clean_name}'")


def get_registered_tools() -> List[str]:
    return list(TOOL_REGISTRY.keys())


def _route_decision(state: AgentState) -> str:
    """
    Conditional routing function from decision node to the appropriate tool or general node.
    """
    next_node = str(state.get("next_node") or "").strip().lower()
    if next_node in TOOL_REGISTRY:
        return next_node
    log(f"[WorkflowGraph] Unknown or unimplemented route '{next_node}', falling back to 'general_llm'")
    return "general_llm"


def build_workflow_graph() -> Any:
    """
    Builds and compiles the central LangGraph agentic workflow.
    Graph topology:
      START -> decision_node -> [dynamic conditional branch: user_activity | general_llm | registered tools]
                             -> synthesis_node -> END
    """
    builder = StateGraph(AgentState)

    # 1. Add core decision node
    builder.add_node("decision_node", decision_node)

    # 2. Add synthesis node
    builder.add_node("synthesis_node", synthesis_node)

    # 3. Add all registered tool and general nodes dynamically
    for tool_name, node_func in TOOL_REGISTRY.items():
        builder.add_node(tool_name, node_func)

    # 4. Connect START to decision node
    builder.add_edge(START, "decision_node")

    # 5. Define dynamic conditional routing from decision node
    routing_map = {name: name for name in TOOL_REGISTRY.keys()}
    builder.add_conditional_edges(
        "decision_node",
        _route_decision,
        routing_map,
    )

    # 6. Route all tool nodes into synthesis_node, and synthesis to END
    for tool_name in TOOL_REGISTRY.keys():
        builder.add_edge(tool_name, "synthesis_node")

    builder.add_edge("synthesis_node", END)

    compiled = builder.compile()
    log(f"[WorkflowGraph] Compiled central LangGraph agentic workflow with active nodes: {list(TOOL_REGISTRY.keys()) + ['decision_node', 'synthesis_node']}")
    return compiled


def get_compiled_workflow() -> Any:
    global _COMPILED_GRAPH
    if _COMPILED_GRAPH is None:
        _COMPILED_GRAPH = build_workflow_graph()
    return _COMPILED_GRAPH


async def run_chat_workflow(
    job_id: str,
    session_id: str,
    user_query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Step 1 & Orchestrator:
    Receives job_id, session_id, user_query, short-term chat history, and user profile.
    Initializes LangGraph state, executes workflow, and returns final synthesized response.
    """
    if chat_history is None:
        chat_history = []
    if user_profile is None:
        from config import get_user_profile
        user_profile = get_user_profile()

    user_tz = resolve_user_timezone(user_profile)

    # Step 1: Initialize LangGraph State
    initial_state: AgentState = {
        "job_id": job_id,
        "session_id": session_id,
        "user_query": user_query,
        "chat_history": chat_history,
        "user_profile": user_profile,
        "user_timezone": str(user_tz),
        "next_node": "",
        "decision_reasoning": "",
        "tool_parameters": {},
        "retrieved_context": {},
        "node_outputs": {},
        "final_response": "",
        "error": None,
        "metadata": {},
    }

    log(f"[WorkflowGraph] Executing chat workflow for session {session_id} (job_id={job_id})...")

    graph = get_compiled_workflow()

    try:
        # Run graph execution in thread to keep asyncio event loop responsive
        output_state: AgentState = await asyncio.to_thread(graph.invoke, initial_state)
        final_answer = output_state.get("final_response") or ""
        if not final_answer:
            final_answer = "I processed your request, but generated no text. Please try again."
        log(f"[WorkflowGraph] Workflow completed successfully for session {session_id} (length={len(final_answer)} chars)")
        return final_answer
    except Exception as e:
        log_error(f"[WorkflowGraph] LangGraph workflow execution encountered an error: {e}")
        user_name = user_profile.get("user_name", "there")
        return (
            f"I apologize {user_name}, but I ran into an issue processing your request through the agentic workflow. "
            "Please check your configured AI provider in Configurations > AI Config."
        )
