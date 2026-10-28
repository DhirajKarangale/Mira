from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from .retrieval import retrieve_mira_context
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.mira_assistant.guidance")


def generate_mira_guidance(
    query: str,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
    retrieved_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Requirement 3: Generates clear, accurate, step-by-step guidance for MIRA
    questions using retrieved project context and inspected files.
    """
    user_name = (user_profile or {}).get("user_name", "User")
    
    # 1. Retrieve project knowledge if not already supplied
    if retrieved_ctx is None:
        retrieved_ctx = retrieve_mira_context(query)

    kb_hits = retrieved_ctx.get("kb_hits", [])
    inspected_files = retrieved_ctx.get("inspected_files", [])

    # Format knowledge base context
    kb_snippets: List[str] = []
    for idx, hit in enumerate(kb_hits[:4], start=1):
        source = hit.get("source_file", "unknown")
        module = hit.get("module", "Core")
        breadcrumb = hit.get("breadcrumb", "")
        heading = hit.get("heading", "")
        text = hit.get("text", "").strip()
        kb_snippets.append(
            f"--- [KB Chunk #{idx} | Source: {source} | Module: {module}] ---\n"
            f"Section: {breadcrumb}\nHeading: {heading}\n{text}"
        )
    kb_context_text = "\n\n".join(kb_snippets) if kb_snippets else "No matching knowledge base records found."

    # Format inspected source code
    code_snippets: List[str] = []
    for f in inspected_files:
        path = f.get("path")
        content = f.get("content", "")
        code_snippets.append(f"--- [Inspected Source File: {path}] ---\n{content}")
    code_context_text = "\n\n".join(code_snippets) if code_snippets else "No source files inspected."

    # Format recent conversation turns for context continuity
    history_turns: List[str] = []
    for item in (chat_history or [])[-6:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = str(item.get("content") or item.get("user") or item.get("ai") or "").strip()
        if content and content != query:
            speaker = user_name if role == "user" else "MIRA Assistant"
            history_turns.append(f"{speaker}: {content}")
    history_text = "\n".join(history_turns) if history_turns else "None (first turn in conversation)."

    system_prompt = f"""You are the MIRA Project Assistant inside the MIRA desktop companion.
Your role is to answer questions about MIRA's architecture, microservices, implementation details,
APIs, Redis streams, configuration, debugging, and usage.

User Name: {user_name}
User Query: "{query}"

Recent Conversation History:
{history_text}

MIRA Master Knowledge Base Context:
{kb_context_text}

Project Source Code Context:
{code_context_text}

Strict Guidelines:
1. Provide clear, accurate, step-by-step guidance for implementation, configuration, debugging, or usage questions.
2. Reference relevant module names (Engine, Vault, Memory, Message Broker, Operator, Client, scripts), exact file paths, functions, APIs, Redis streams (e.g. ocr_extraction, ocr_summarization, embedding_memory, llm_chat), and ports (9001-9005, 6379) wherever supported by the context.
3. Use the knowledge base and inspected files as the primary source of truth. NEVER invent or assume undocumented functions, APIs, or streams exist.
4. Maintain project context across follow-up questions so the user can discuss the same task naturally.
5. Keep responses concise, direct, and focused on what was asked. Avoid unnecessary conversational filler.
6. Enforce English only.
"""
    try:
        raw_response = call_llm(system_prompt, work="chat")
        return raw_response.strip()
    except Exception as e:
        log_error(f"[MIRAGuidance] LLM generation failed: {e}")
        return (
            f"I encountered a temporary issue generating guidance: {e}. "
            "Please check your configured AI provider keys in Configurations > AI Config."
        )

