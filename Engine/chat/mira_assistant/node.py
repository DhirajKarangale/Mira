from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from .detection import detect_mira_intent
from .executor import plan_and_execute_modification, ProjectModificationResult
from .guidance import generate_mira_guidance
from .retrieval import retrieve_mira_context
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.mira_assistant.node")


def _broadcast_progress_safe(job_id: str, session_id: str, status: str, message: str) -> None:
    """Safely dispatches progress update to connected WebSocket clients if loop is running."""
    try:
        from ..websocket import ws_manager
        if hasattr(ws_manager, "broadcast_chat_progress"):
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(
                    ws_manager.broadcast_chat_progress(
                        job_id=job_id,
                        session_id=session_id,
                        status=status,
                        message=message,
                    )
                )
            except RuntimeError:
                # No running event loop in synchronous test thread
                pass
    except Exception:
        pass


def mira_assistant_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Central LangGraph Node for MIRA Assistant Addon.
    Executes when Decision Node routes to 'mira_assistant'.
    
    Handles:
      1. Informational queries (Architecture, modules, APIs, Redis streams, configuration, debugging).
      2. Direct project modifications (Adding, updating, editing files with safety & verification).
      3. Strict deletion restriction enforcement.
    """
    user_query = str(state.get("user_query") or "").strip()
    chat_history = state.get("chat_history") or []
    user_profile = state.get("user_profile") or {}
    job_id = state.get("job_id", "")
    session_id = state.get("session_id", "")
    tool_params = state.get("tool_parameters") or {}

    intent = tool_params.get("intent") or detect_mira_intent(user_query)
    log(f"[MIRAAssistantNode] Handling MIRA query (intent='{intent}'): '{user_query[:75]}...'")

    def progress_callback(status: str, msg: str) -> None:
        log(f"[MIRAAssistantNode] Progress [{status}]: {msg}")
        _broadcast_progress_safe(job_id, session_id, status, msg)

    final_answer = ""
    current_outputs = dict(state.get("node_outputs") or {})

    if intent == "MODIFICATION":
        progress_callback("started", "Initiating project modification workflow...")
        result: ProjectModificationResult = plan_and_execute_modification(
            query=user_query,
            chat_history=chat_history,
            progress_callback=progress_callback,
        )
        final_answer = result.to_markdown()
        current_outputs["modification_result"] = {
            "success": result.success,
            "summary": result.summary,
            "files_modified": result.files_modified,
            "verification_passed": result.verification_passed,
        }
    else:
        progress_callback("retrieving", "Searching MIRA Master Knowledge Base...")
        ctx = retrieve_mira_context(user_query)
        progress_callback("synthesizing", "Synthesizing step-by-step guidance...")
        final_answer = generate_mira_guidance(
            query=user_query,
            chat_history=chat_history,
            user_profile=user_profile,
            retrieved_ctx=ctx,
        )
        current_outputs["mira_knowledge_context"] = {
            "kb_hits_count": ctx.get("kb_hits_count", 0),
            "kb_path": ctx.get("kb_path_used"),
        }

    current_outputs["mira_assistant_response"] = final_answer
    current_outputs["executed_node"] = "mira_assistant"

    log(f"[MIRAAssistantNode] Finished response generation (length={len(final_answer)} chars)")
    return {
        "node_outputs": current_outputs,
        "final_response": final_answer,
    }
