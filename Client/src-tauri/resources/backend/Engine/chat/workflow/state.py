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

    # Routing, Intent & Retrieval Planning
    next_node: str  # 'user_activity', 'history_answer', 'general_llm', or dynamic tool
    decision_reasoning: str
    is_follow_up: bool
    can_answer_from_history: bool
    detail_level: str  # 'overview', 'detailed', 'concise'
    resolved_query: str
    retrieval_plan: Dict[str, Any]
    tool_parameters: Dict[str, Any]

    # Node execution outputs & retrieved context
    retrieved_context: Dict[str, Any]  # Stores retrieved activity records, counts, timestamps, found status
    node_outputs: Dict[str, Any]       # Generic outputs from executed nodes

    # Final synthesized answer
    final_response: str
    error: Optional[str]
    metadata: Dict[str, Any]
