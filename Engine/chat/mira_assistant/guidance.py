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
    Requirement 3: Generates clear, accurate, specific, step-by-step guidance
    for MIRA questions strictly grounded in retrieved Knowledge Base context and inspected source files.
    No project information is hardcoded.
    """
    user_name = (user_profile or {}).get("user_name", "User")
    
    # 1. Retrieve project knowledge from Knowledge Base & inspected source files
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
            f"--- [MIRA Knowledge Base Chunk #{idx} | Source: {source} | Module: {module}] ---\n"
            f"Section: {breadcrumb}\nHeading: {heading}\n{text}"
        )
    kb_context_text = "\n\n".join(kb_snippets) if kb_snippets else "No matching knowledge base records found."

    # Format inspected source code
    code_snippets: List[str] = []
    for f in inspected_files:
        path = f.get("path")
        content = f.get("content", "")
        code_snippets.append(f"--- [Inspected Project Source File: {path}] ---\n{content}")
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

    system_prompt = f"""You are MIRA. Answer technical questions about the MIRA project strictly using the retrieved context and source code below.

User Query: "{query}"

Conversation History:
{history_text}

Knowledge Base Context:
{kb_context_text}

Source Code Context:
{code_context_text}

Strict Rules:
1. Respond strictly to the user's query with a short, simple, and precise answer based only on the retrieved context.
2. Do not include extra information, unsolicited suggestions, capability lists, or unrelated content.
3. If asked "what are you", state what MIRA is based on the retrieved Knowledge Base definition without volunteering creator or developer information.
4. If asked who created or developed MIRA, state only the creator name: "**Dhiraj Karangale**". Do not add GitHub handles, links, or team references.
5. Reference exact module names, file paths, functions, and configuration keys present in the retrieved context when relevant. For voice queries, reference `Client/src/modules/voice/elevenlabsClient.ts` to distinguish voice personas from acoustic models.
6. Do not invent undocumented features or details.
7. Respond strictly in English.
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
