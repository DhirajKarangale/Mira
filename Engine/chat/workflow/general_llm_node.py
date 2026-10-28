from __future__ import annotations

import logging
from typing import Any, Dict, List
from .state import AgentState
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.general_llm")


def general_llm_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 3: General LLM Node.
    Executes general-purpose LLM completions using the existing LLM implementation
    and config.json ('general' work configuration, very low temperature 0.0).
    Includes relevant short-term chat history and user profile information.
    Answers strictly what the user asked with concise, factual responses in English only.
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")
    location_parts = [
        user_profile.get("city"),
        user_profile.get("state"),
        user_profile.get("country"),
    ]
    location_str = ", ".join([str(p).strip() for p in location_parts if p and str(p).strip()]) or "Unknown"

    log(f"[GeneralLLMNode] Generating general response for user '{user_name}' (location: {location_str})")

    # Format conversation history
    normalized_turns: List[str] = []
    for item in chat_history[-10:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        clean_content = str(content).strip()
        if clean_content and clean_content != user_query:
            speaker = user_name if role == "user" else "MIRA"
            normalized_turns.append(f"{speaker}: {clean_content}")

    history_text = "\n".join(normalized_turns) if normalized_turns else "No previous conversation in this session."

    system_preamble = (
        f"You are MIRA, a helpful and precise desktop AI companion.\n"
        f"User Profile:\n"
        f"- Name: {user_name}\n"
        f"- Location: {location_str}\n\n"
        f"Conversation History:\n{history_text}\n\n"
        f"Current Query from {user_name}: {user_query}\n\n"
        f"Instructions:\n"
        f"1. Answer ONLY what the user asked. Keep your response short, simple, and stick directly to the point.\n"
        f"2. Be concise, direct, and factually accurate. Do NOT elaborate unnecessarily unless the user specifically requested a detailed explanation.\n"
        f"3. Do NOT include unrelated information, additional explanations, suggestions, assumptions, or unnecessary introductions.\n"
        f"4. AVOID conversational pleasantries, greetings, or trailing follow-up questions.\n"
        f"5. LANGUAGE REQUIREMENT: You MUST respond in English only. Never respond in any other language."
    )

    try:
        raw_response = call_llm(system_preamble, work="general")
        answer = raw_response.strip()
    except Exception as e:
        log_error(f"[GeneralLLMNode] General LLM call failed: {e}")
        answer = (
            f"I apologize, {user_name}, but I encountered a momentary hiccup connecting to the AI provider. "
            "Please check your API key configuration in Configurations > AI Config."
        )

    current_outputs = dict(state.get("node_outputs") or {})
    current_outputs["general_llm_response"] = answer
    current_outputs["executed_node"] = "general_llm"

    return {
        "node_outputs": current_outputs,
        "final_response": answer,
    }
