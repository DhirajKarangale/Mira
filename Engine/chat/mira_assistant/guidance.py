from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from .retrieval import retrieve_mira_context
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.mira_assistant.guidance")

CORE_PROJECT_IDENTITY = """
CORE MIRA PROJECT FACTS & IDENTITY:
- Project Name: MIRA (Memory, Intelligence, Recall, Assistant)
- Creator, Architect & Developer: Dhiraj Karangale
- GitHub: https://github.com/DhirajKarangale (@DhirajKarangale)
- Portfolio: https://dhirajkarangale.vercel.app/
- LinkedIn: https://www.linkedin.com/in/dhiraj-karangale-464ab91bb/
- Contact Email: dakarangale02@gmail.com
- Contact Phone: +91 7620320595
- License: MIT License (Copyright (c) 2026 Dhiraj Karangale)
- System Definition: MIRA is an autonomous, decentralized, privacy-first personal AI operating system and ambient digital memory companion.
- The Four Pillars:
  1. Memory: Continuous perceptual vision and local vector indexing without cloud telemetry.
  2. Intelligence: Local LangGraph agentic reasoning workflows with dynamic multi-provider quota failover (Gemini -> Groq).
  3. Recall: Hardware-encrypted semantic vector search over past activities using local Qdrant.
  4. Assistant: Proactive morning executive dashboards, multi-session chat streaming, and ambient neural voice control.
- Microservice Stack & Ports:
  * Client: Tauri v2, React 19, TypeScript, Tailwind CSS v4 (Default Port: 9004 / 9005)
  * Engine: Python 3.11, FastAPI, Faster-Whisper neural STT, Gemini & Groq fallback (Default Port: 9007 / 9004)
  * Memory: Python 3.11, FastAPI, OpenCV perceptual diffing (0.008 threshold), Tesseract OCR, Qdrant vector store (Default Port: 9006 / 9003)
  * Operator: Rust (2021 edition), Tokio, Axum, xcap native screen capture, per-app window blacklist (Default Port: 9003 / 9002)
  * Vault: Python 3.11, FastAPI, SQLite, PyNaCl ChaCha20-Poly1305 encryption, OS keyring master key (Default Port: 9001)
  * Message Broker: Python 3.11, FastAPI, Redis Streams (ocr_extraction, ocr_summarization, embedding_memory, llm_chat, config_sync), consumer groups, PEL recovery (Default Port: 9002 & Redis 6379)
"""


def generate_mira_guidance(
    query: str,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
    retrieved_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Requirement 3: Generates clear, accurate, specific, step-by-step guidance
    for MIRA questions using retrieved project context and inspected files.
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

    system_prompt = f"""You are the MIRA Project Assistant inside the MIRA desktop companion.
Your role is to answer questions about MIRA's creator, architecture, microservices, implementation details,
APIs, Redis streams, configuration, debugging, and usage.

{CORE_PROJECT_IDENTITY}

User Name: {user_name}
User Query: "{query}"

Recent Conversation History:
{history_text}

MIRA Master Knowledge Base Context:
{kb_context_text}

Project Source Code Context:
{code_context_text}

CRITICAL RESPONSE GUIDELINES (Avoid vague or robotic answers):
1. DIRECT ANSWER FIRST: Answer the specific question directly and factually in the first sentence.
2. CREATOR / AUTHOR / ORIGIN QUESTIONS:
   - When asked "who developed you", "who created you", "who made MIRA", or about the project creator/author:
     State clearly and immediately: "MIRA was created and developed by **Dhiraj Karangale** ([@DhirajKarangale](https://github.com/DhirajKarangale))."
     Provide context: Dhiraj Karangale is the architect and developer of MIRA (Portfolio: https://dhirajkarangale.vercel.app/, LinkedIn: Dhiraj Karangale).
     NEVER claim you were developed by a vague "MIRA Project Team" or claim to have "no external creator".
3. CONCRETE TECHNICAL DETAILS:
   - Always reference exact module names, file paths (e.g., `Engine/chat/router.py`, `Vault/crypto.py`), functions, Redis stream keys (`ocr_extraction`, `ocr_summarization`, `embedding_memory`, `llm_chat`, `config_sync`), ports (9001-9005, 6379), and exact configuration keys.
   - Do NOT give generic high-level summaries when technical details are requested.
4. NO UNSOLICITED CAPABILITY LISTS:
   - Do NOT recite bulleted lists of what you can assist with (e.g. "I am designed to assist with Architecture, Implementation, Infrastructure...") unless the user specifically asks "what can you do?".
5. CONCISE, FACTUAL & HELPFUL:
   - Keep answers focused, precise, and well-structured with Markdown headings and code blocks where helpful.
   - Strict English only.
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
