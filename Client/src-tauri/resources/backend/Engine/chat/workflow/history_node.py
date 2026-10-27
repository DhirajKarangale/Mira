from __future__ import annotations

import logging
from typing import Any, Dict, List
from .state import AgentState
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.history_node")


def history_node(state: AgentState) -> Dict[str, Any]:
    """
    Step: History Answer Node.
    Answers follow-up questions, clarifications, reformattings, or queries
    directly from the current session's conversation history without making
    redundant vector searches or external retrieval calls.
    Uses LLM work category 'general' (temperature 0.0).
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")
    detail_level = state.get("detail_level") or state.get("tool_parameters", {}).get("detail_level", "concise")

    log(f"[HistoryNode] Answering follow-up query from session history for '{user_name}' (detail_level={detail_level})")

    # Format conversation turns chronologically
    normalized_turns: List[str] = []
    for item in chat_history:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        clean_content = str(content).strip()
        if clean_content and clean_content != user_query:
            speaker = user_name if role == "user" else "MIRA"
            normalized_turns.append(f"{speaker}: {clean_content}")

    history_text = "\n".join(normalized_turns) if normalized_turns else "No prior messages."

    detail_instructions = {
        "overview": "Provide a concise, high-level overview of the relevant information from the conversation.",
        "detailed": "Provide all relevant details, numbers, timestamps, and information discussed previously.",
        "concise": "Answer directly and concisely, addressing only the specific question asked."
    }.get(detail_level, "Answer directly and concisely.")

    prompt = f"""You are MIRA, a helpful and precise desktop AI companion.
The user is asking a follow-up question that can be answered directly from the current conversation history.

User Name: {user_name}
Current Query: "{user_query}"
Requested Detail Level: {detail_level}

Conversation History for this session:
{history_text}

Strict Rules:
1. Answer the user's question using ONLY the facts and data stated in the conversation history above.
2. {detail_instructions}
3. Do NOT invent, assume, or add unsupported information.
4. If the conversation history does not contain the answer, state factually what was discussed and that the specific requested detail was not previously mentioned.
5. Do NOT include greetings, pleasantries, or trailing questions.
"""

    try:
        raw_response = call_llm(prompt, work="general")
        answer = raw_response.strip()
    except Exception as e:
        log_error(f"[HistoryNode] History LLM completion failed: {e}")
        answer = "I could not resolve this from the recent conversation history."

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["history_response"] = answer
    current_outputs["executed_node"] = "history_answer"

    return {
        "node_outputs": current_outputs,
        "final_response": answer,
    }
