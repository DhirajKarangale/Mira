from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Set
import requests

from .config import get_vault_base_url
from .websocket import ws_manager
from llm import call_llm
from vault_logger import log, log_error, mask_sensitive

logger = logging.getLogger("mira.engine.chat.naming")


def format_naming_prompt(messages: List[Dict[str, Any]]) -> str:
    """
    Format an expert few-shot prompt for the LLM to generate a short, high-signal chat title (2 to 4 words).
    Provides the complete conversation dialogue so the LLM has full context.
    """
    conversation_lines: List[str] = []
    for msg in messages:
        role = "User" if msg.get("role") == "user" else "Mira"
        content = (msg.get("content") or "").strip()
        # Truncate overly long single content blocks to maintain a fast, focused prompt
        if len(content) > 300:
            content = content[:300] + "..."
        if content:
            conversation_lines.append(f"{role}: {content}")

    dialogue = "\n".join(conversation_lines)
    prompt = (
        "You are an expert conversation summarizer that creates concise, high-signal titles for chat sessions.\n\n"
        "Task: Read the dialogue and output a concise, specific title summarizing the core topic.\n\n"
        "Strict Rules:\n"
        "- Length: 2 to 4 words only (maximum 30 characters).\n"
        "- Format: Use Title Case noun phrases (e.g., 'FastAPI CORS Setup', 'Instagram Founders').\n"
        "- Relevance: Accurately capture the central entity, subject, or question.\n"
        "- Prohibited: NO quotes, colons, question marks, period, or punctuation.\n"
        "- Prohibited: NO generic fillers like 'Chat', 'Conversation', 'Discussion', 'Overview', 'Query', 'Help'.\n"
        "- Output ONLY the title itself. Do not explain or add commentary.\n\n"
        "Examples:\n"
        "Dialogue: User: Who created Python and why? Mira: Guido van Rossum created Python in 1991...\n"
        "Title: Python Creation & Origin\n\n"
        "Dialogue: User: How to fix CORS errors in FastAPI? Mira: Use CORSMiddleware...\n"
        "Title: FastAPI CORS Setup\n\n"
        "Dialogue: User: What is the capital of France? Mira: Paris is the capital...\n"
        "Title: Capital of France\n\n"
        f"Dialogue:\n{dialogue}\n\n"
        "Title:"
    )
    return prompt


def sanitize_chat_name(raw_title: str, fallback_content: str = "") -> str:
    """
    Cleans and standardizes the LLM-generated title.
    Strips quotes, prefixes, extra symbols, and strictly keeps length within 2-4 words / 32 chars.
    """
    if not raw_title or not raw_title.strip():
        return _make_fallback_title(fallback_content)

    # Strip prefixes like 'Title:', 'Chat Name:', 'Topic:', etc.
    cleaned = re.sub(r'^(title|chat name|topic|subject|name):\s*', '', raw_title.strip(), flags=re.IGNORECASE)
    # Strip quotes (regular & smart/curly quotes), backticks, asterisks, hashtags
    cleaned = cleaned.strip('\'"`*# \t\r\n“”‘’«»')
    # If multiple lines, take only the first non-empty line
    first_line = next((line.strip('\'"`*# \t\r\n“”‘’«»') for line in cleaned.splitlines() if line.strip()), "")
    cleaned = first_line or cleaned
    # Strip trailing punctuation (. , : ; ! ? -)
    cleaned = re.sub(r'[.:,;!?\-]+$', '', cleaned).strip()

    # Reject if empty or standard error / model unavailable string
    lowered = cleaned.lower()
    if (
        not cleaned
        or len(cleaned) < 2
        or "error" in lowered
        or "apologize" in lowered
        or "unable to" in lowered
        or "ai provider" in lowered
        or "as an ai" in lowered
    ):
        return _make_fallback_title(fallback_content)

    # Limit strictly to a maximum of 4 words and 32 characters
    words = cleaned.split()
    if len(words) > 4:
        cleaned = " ".join(words[:4])
    if len(cleaned) > 32:
        cleaned = cleaned[:32].rstrip(" -:,.")

    # Apply Title Casing if all lowercase
    if cleaned.islower():
        cleaned = cleaned.title()

    return cleaned or _make_fallback_title(fallback_content)


def _make_fallback_title(fallback_content: str) -> str:
    """
    Extracts a clean, short 2-3 word topic from the user's initial query as a fallback.
    """
    cleaned = (fallback_content or "").strip()
    if not cleaned:
        return "New Chat"

    # Strip common question starters
    cleaned = re.sub(
        r'^(who|what|where|when|why|how|can you|could you|please|tell me|explain|describe)\s+(is|are|was|were|to|do|did|does)?\s*',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    # Strip non-alphanumeric punctuation except hyphens
    cleaned = re.sub(r'[^\w\s-]', '', cleaned).strip()
    words = cleaned.split()
    if not words:
        return "New Chat"

    # Take at most 3 words, title-cased
    candidate = " ".join(words[:3]).title()
    return candidate[:28].rstrip()


class ChatNamingQueue:
    """
    In-memory queue to manage multiple chat-naming requests efficiently.
    Ensures safe concurrency, de-duplication, and non-blocking background processing.
    """

    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._pending_sessions: Set[str] = set()
        self._worker_task: Optional[asyncio.Task] = None
        self._running: bool = False

    def enqueue(self, session_id: str) -> bool:
        """
        Enqueue a session_id for automatic naming.
        Returns True if newly enqueued, False if empty or already in pending set.
        """
        clean_sid = (session_id or "").strip()
        if not clean_sid:
            return False

        if clean_sid in self._pending_sessions:
            return False

        self._pending_sessions.add(clean_sid)
        self._queue.put_nowait(clean_sid)
        log(f"[ChatNaming] Enqueued session '{clean_sid}' for naming. Queue depth: {self._queue.qsize()}")
        return True

    async def start(self) -> None:
        """
        Start the background queue processor worker task.
        """
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        log("[ChatNaming] Chat naming queue worker task started.")

    async def stop(self) -> None:
        """
        Stop the background queue processor worker task gracefully.
        """
        if not self._running:
            return
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except (asyncio.CancelledError, Exception):
                pass
            self._worker_task = None
        self._pending_sessions.clear()
        log("[ChatNaming] Chat naming queue worker task stopped.")

    async def _worker_loop(self) -> None:
        log("[ChatNaming] Worker loop running and waiting for naming jobs...")
        while self._running:
            try:
                session_id = await self._queue.get()
                try:
                    await self._process_session(session_id)
                finally:
                    self._pending_sessions.discard(session_id)
                    self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f"[ChatNaming] Unexpected error in worker loop: {e}")
                await asyncio.sleep(1.0)
        log("[ChatNaming] Worker loop terminated.")

    async def _process_session(self, session_id: str) -> bool:
        """
        Process chat naming for a session:
        1. Query database to check if chat_name is null or empty.
        2. If null or empty, fetch the session's messages (min 2, max 6).
        3. Use existing LLM script to generate a short, relevant chat name.
        4. Store the generated name in the database first.
        5. Send it to the Client through WebSockets.
        """
        vault_base = get_vault_base_url()

        # Step 1: Query Vault for session messages and check existing chat_name
        def _fetch_messages():
            try:
                resp = requests.get(
                    f"{vault_base}/chats/sessions/{session_id}",
                    params={"limit": 100},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    return resp.json()
                return None
            except Exception as ex:
                log_error(f"[ChatNaming] Error fetching session {session_id} from Vault: {ex}")
                return None

        session_data = await asyncio.to_thread(_fetch_messages)
        if not session_data or not isinstance(session_data, dict):
            log_error(f"[ChatNaming] Could not retrieve session '{session_id}' from Vault, skipping naming.")
            return False

        # Check whether chat_name is already present (not null and not empty)
        existing_chat_name = session_data.get("chat_name")
        messages: List[Dict[str, Any]] = session_data.get("messages") or []

        # If session_data doesn't have top-level chat_name, check if any message already has a chat_name
        if not existing_chat_name:
            for m in messages:
                m_name = m.get("chat_name")
                if m_name and str(m_name).strip():
                    existing_chat_name = str(m_name).strip()
                    break

        if existing_chat_name and str(existing_chat_name).strip():
            log(f"[ChatNaming] Session '{session_id}' already has chat_name '{existing_chat_name}', skipping naming.")
            return False

        # Step 2: Fetch the session's messages, using a minimum of 2 messages (one user and one AI)
        if len(messages) < 2:
            log(f"[ChatNaming] Session '{session_id}' has fewer than 2 messages ({len(messages)}), skipping naming.")
            return False

        has_user = any(m.get("role") == "user" for m in messages)
        has_ai = any(m.get("role") == "ai" for m in messages)
        if not (has_user and has_ai):
            log(f"[ChatNaming] Session '{session_id}' missing user or AI message, skipping naming.")
            return False

        target_messages = messages
        first_user_content = next((m.get("content", "") for m in target_messages if m.get("role") == "user"), "")

        # Step 3: Call existing LLM script to generate a short, relevant chat name
        prompt = format_naming_prompt(target_messages)
        raw_title = ""
        try:
            log(f"[ChatNaming] Requesting LLM title for session '{session_id}' with {len(target_messages)} messages...")
            raw_title = await asyncio.to_thread(call_llm, prompt, "chat")
        except Exception as e:
            log_error(f"[ChatNaming] LLM call failed for session '{session_id}': {mask_sensitive(str(e))}")

        generated_name = sanitize_chat_name(raw_title, fallback_content=first_user_content)
        log(f"[ChatNaming] Generated chat name for session '{session_id}': '{generated_name}'")

        # Step 4: Store generated name in the database FIRST
        def _save_name_to_vault():
            try:
                resp = requests.patch(
                    f"{vault_base}/chats/sessions/{session_id}",
                    json={"chat_name": generated_name},
                    timeout=5.0,
                )
                return resp.status_code in (200, 201)
            except Exception as ex:
                log_error(f"[ChatNaming] Failed to save chat name to Vault: {ex}")
                return False

        saved = await asyncio.to_thread(_save_name_to_vault)
        if not saved:
            log_error(f"[ChatNaming] Database update failed for session '{session_id}', will not broadcast.")
            return False

        log(f"[ChatNaming] Successfully stored chat_name='{generated_name}' in database for session '{session_id}'.")

        # Step 5: Send the updated name to the Client through WebSockets
        sent_count = await ws_manager.broadcast_chat_rename(
            session_id=session_id,
            chat_name=generated_name,
        )
        log(f"[ChatNaming] Broadcasted chat_rename to {sent_count} client(s) for session '{session_id}'.")
        return True


chat_naming_queue = ChatNamingQueue()
