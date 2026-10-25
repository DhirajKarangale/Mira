from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class AgentState(TypedDict, total=False):
    # Core identifiers and inputs
    job_id: str
    session_id: str
    user_query: str
    chat_history: List[Dict[str, str]]
    user_profile: Dict[str, Any]
    user_timezone: str

    # Routing and Decision
    next_node: str  # e.g., 'user_activity', 'general_llm', or future tool name
    decision_reasoning: str
    tool_parameters: Dict[str, Any]

    # Node execution outputs & retrieved context
    retrieved_context: Dict[str, Any]  # Stores retrieved activity records, counts, timestamps, found status
    node_outputs: Dict[str, Any]       # Generic outputs from executed nodes

    # Final synthesized answer
    final_response: str
    error: Optional[str]
    metadata: Dict[str, Any]
