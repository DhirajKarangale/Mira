from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional
import requests
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

import config
from vault_logger import log, log_error, mask_sensitive
from llm import call_llm

logger = logging.getLogger("mira.engine.chat")
router = APIRouter(prefix="", tags=["Chat"])

CONSUMER_KEY_LLM_CHAT: str = "llm_chat"
CONSUMER_GROUP_LLM_CHAT: str = "CONSUMER_GROUP_LLM_CHAT"

# ==============================================================================
# Models
# ==============================================================================

class ChatSessionItem(BaseModel):
    session_id: str
    chat_name: Optional[str] = None
    latest_created_at: str
    created_at: Optional[str] = None
    message_count: Optional[int] = 0

class ChatSessionsResponse(BaseModel):
    sessions: List[ChatSessionItem]
    total_pages: int
    current_page: int
    total_items: int
    limit: int
    next_cursor: Optional[str] = None
    has_more: bool

class ChatMessageItem(BaseModel):
    id: str
    session_id: str
    chat_name: Optional[str] = None
    role: str
    content: str
    created_at: str

class ChatMessagesResponse(BaseModel):
    session_id: str
    messages: List[ChatMessageItem]
    total_pages: int
    current_page: int
    total_messages: int
    limit: int
    next_cursor: Optional[str] = None
    has_more: bool

class SendChatMessageRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Chat session UUID")
    content: str = Field(..., min_length=1, description="Message text")
    chat_name: Optional[str] = Field(None, description="Session name / title")
    role: Optional[str] = Field("user", description="'user' or 'ai'")
    generate_ai_reply: Optional[bool] = Field(True, description="Whether Engine should trigger LLM completion")

class SendChatMessageResponse(BaseModel):
    session_id: str
    user_message: ChatMessageItem
    ai_message: Optional[ChatMessageItem] = None

# ==============================================================================
# Helper Functions
# ==============================================================================

def get_vault_base_url() -> str:
    url = config.VAULT_URL or config.get_service_url("vault", "http://127.0.0.1:9001")
    return url.rstrip("/")

# ==============================================================================
# API 1: Get All Chat Sessions
# ==============================================================================

@router.get(
    "/chats/sessions",
    response_model=ChatSessionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get All Chat Sessions",
)
@router.get(
    "/chat/sessions",
    response_model=ChatSessionsResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def get_chat_sessions_endpoint(
    limit: int = Query(10, ge=1, le=100, description="Items per page (default 10)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination"),
    page: Optional[int] = Query(None, ge=1, description="Page number (default 1)"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Return unique session_id values with their chat_name and latest created_at.
    Sorted by latest created_at first.
    Cursor-based pagination with 10 sessions per page.
    """
    vault_base = get_vault_base_url()
    params: Dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    if page is not None and page >= 1:
        params["page"] = page
    if offset and offset > 0:
        params["offset"] = offset

    try:
        def _fetch():
            resp = requests.get(f"{vault_base}/chats/sessions", params=params, timeout=3.0)
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"Vault returned {resp.status_code} for /chats/sessions")
            return None

        result = await asyncio.to_thread(_fetch)
        if result:
            return result
    except Exception as e:
        logger.error(f"Error querying Vault for chat sessions: {e}")

    # Fallback / empty result
    effective_page = page if (page and page >= 1) else 1
    return {
        "sessions": [],
        "total_pages": 1,
        "current_page": effective_page,
        "total_items": 0,
        "limit": limit,
        "next_cursor": None,
        "has_more": False,
    }

# ==============================================================================
# API 2: Get Chats by Session
# ==============================================================================

@router.get(
    "/chats/sessions/{session_id}",
    response_model=ChatMessagesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Chats by Session",
)
@router.get(
    "/chats/{session_id}",
    response_model=ChatMessagesResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
@router.get(
    "/chat/sessions/{session_id}",
    response_model=ChatMessagesResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def get_chats_by_session_endpoint(
    session_id: str,
    limit: int = Query(30, ge=1, le=100, description="Items per page (default 30)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination"),
    page: Optional[int] = Query(None, ge=1, description="Page number (default 1)"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Accept a session_id.
    Return its messages ordered by created_at ascending, 30 messages per page.
    Cursor-based pagination with next 30 messages when frontend scrolls.
    """
    clean_sid = session_id.strip()
    vault_base = get_vault_base_url()
    params: Dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    if page is not None and page >= 1:
        params["page"] = page
    if offset and offset > 0:
        params["offset"] = offset

    try:
        def _fetch():
            resp = requests.get(f"{vault_base}/chats/sessions/{clean_sid}", params=params, timeout=3.0)
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"Vault returned {resp.status_code} for /chats/sessions/{clean_sid}")
            return None

        result = await asyncio.to_thread(_fetch)
        if result:
            return result
    except Exception as e:
        logger.error(f"Error querying Vault for messages of session '{clean_sid}': {e}")

    # Fallback / empty result
    effective_page = page if (page and page >= 1) else 1
    return {
        "session_id": clean_sid,
        "messages": [],
        "total_pages": 1,
        "current_page": effective_page,
        "total_messages": 0,
        "limit": limit,
        "next_cursor": None,
        "has_more": False,
    }

# ==============================================================================
# API 3: Send Message & Chat Workflow
# ==============================================================================

@router.post(
    "/chats/message",
    response_model=SendChatMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Send Chat Message and Generate AI Reply",
)
@router.post(
    "/chats",
    response_model=SendChatMessageResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def send_chat_message_endpoint(request: SendChatMessageRequest):
    """
    Accept user chat input, persist in Vault, optionally run LLM completion,
    persist AI reply in Vault, and return both.
    """
    vault_base = get_vault_base_url()
    session_id = request.session_id.strip() if request.session_id and request.session_id.strip() else str(uuid.uuid4())
    content = request.content.strip()
    role = (request.role or "user").lower().strip()
    chat_name = request.chat_name.strip() if request.chat_name and request.chat_name.strip() else None

    # If chat_name is missing, generate title from content snippet
    if not chat_name:
        chat_name = content[:40].strip() if len(content) > 40 else content

    # 1. Store user message in Vault
    user_msg_payload = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "chat_name": chat_name,
    }

    try:
        def _post_user():
            r = requests.post(f"{vault_base}/chats", json=user_msg_payload, timeout=3.0)
            if r.status_code in (200, 201):
                return r.json()
            logger.error(f"Vault failed to store user message: {r.status_code} {r.text}")
            return None

        saved_user_msg = await asyncio.to_thread(_post_user)
        if not saved_user_msg:
            saved_user_msg = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "role": role,
                "content": content,
                "chat_name": chat_name,
                "created_at": "",
            }
    except Exception as e:
        logger.error(f"Error connecting to Vault to save message: {e}")
        saved_user_msg = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": role,
            "content": content,
            "chat_name": chat_name,
            "created_at": "",
        }

    # 2. Trigger LLM generation if role is user and generate_ai_reply is True
    saved_ai_msg = None
    if role == "user" and request.generate_ai_reply:
        ai_reply_text = ""
        try:
            # Call Engine LLM with work="chat"
            ai_reply_text = await asyncio.to_thread(call_llm, content, "chat")
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"LLM generation failed for chat session '{session_id}': {mask_sensitive(err_msg)}")
            ai_reply_text = (
                "I am MIRA, your personal AI assistant. Currently no AI model keys are available or responding. "
                "Please check your AI Provider configuration under Configurations > AI Config to enable completions."
            )

        if ai_reply_text:
            ai_msg_payload = {
                "session_id": session_id,
                "role": "ai",
                "content": ai_reply_text,
                "chat_name": chat_name,
            }

            try:
                def _post_ai():
                    r = requests.post(f"{vault_base}/chats", json=ai_msg_payload, timeout=3.0)
                    if r.status_code in (200, 201):
                        return r.json()
                    return None

                saved_ai_msg = await asyncio.to_thread(_post_ai)
            except Exception as e:
                logger.error(f"Failed to save AI reply to Vault: {e}")

            if not saved_ai_msg:
                saved_ai_msg = {
                    "id": str(uuid.uuid4()),
                    "session_id": session_id,
                    "role": "ai",
                    "content": ai_reply_text,
                    "chat_name": chat_name,
                    "created_at": "",
                }

    return {
        "session_id": session_id,
        "user_message": saved_user_msg,
        "ai_message": saved_ai_msg,
    }

# ==============================================================================
# Helper API: Seed Sample Chat Sessions (For testing & initial preview)
# ==============================================================================

@router.post("/chats/seed", status_code=status.HTTP_200_OK, summary="Seed Initial Demo Chats")
async def seed_demo_chats_endpoint(count: int = Query(12, ge=1, le=30)):
    """
    Seeds demo conversation sessions in Vault to test pagination and infinite scrolling.
    """
    vault_base = get_vault_base_url()
    sample_dialogues = [
        ("Project Architecture Planning", [
            ("user", "Can you review the planned MIRA module architecture and tell me what the message broker handles?"),
            ("ai", "In MIRA, the Message Broker acts as the central asynchronous communication hub. It manages Redis Streams, queues, inter-module job routing, and ensures decouple delivery between Operator, Memory, Engine, and Client."),
            ("user", "Great! And where are the encryption keys and configurations stored?"),
            ("ai", "All configurations, secrets, and system logs are stored centrally in Vault. Vault uses OS Credential Store (keyring) and ChaCha20-Poly1305 encryption.")
        ]),
        ("OCR Processing Pipeline", [
            ("user", "How does the screen capture get summarized into memory?"),
            ("ai", "Operator captures active windows, pushes frames to Redis Streams. Memory receives the frames, performs perceptual hashing and Tesseract OCR, then Engine's worker summarizer processes batches into high-level activity logs."),
            ("user", "Is OCR cached to avoid repeated work?"),
            ("ai", "Yes, Memory maintains an LRU OCR cache using perceptual image hashes so unchanged screens don't trigger redundant OCR passes.")
        ]),
        ("Redis Stream Consumer Groups", [
            ("user", "What consumer groups should be configured for the activity stream?"),
            ("ai", "Standard consumer groups include `memory_workers`, `engine_summarizers`, and `vector_indexer`. Each group tracks its own pending entries list (PEL) to guarantee at-least-once delivery."),
        ]),
        ("Knowledge Base Search Optimization", [
            ("user", "How can I speed up vector search queries over past activities?"),
            ("ai", "You can adjust the embedding vector store workers poll interval, ensure Qdrant HNSW indexing is built, and filter by retention date ranges before computing vector similarities."),
        ]),
        ("Daily Work Summary Generation", [
            ("user", "Summarize what I worked on today between 9 AM and 5 PM."),
            ("ai", "Looking at your activity logs: You spent 3.5 hours in VS Code working on MIRA Client and Engine, 1.2 hours in documentation, and 45 minutes testing Redis Streams."),
        ]),
        ("AI Provider Failover Strategy", [
            ("user", "How does provider fallback work if Gemini hits rate limits?"),
            ("ai", "Engine reads the priority list from Vault. If Priority #1 encounters 429 or quota limits, Engine automatically fails over to Priority #2 (e.g. Groq) without dropping the user request."),
        ]),
        ("UI Dark Theme Aesthetics", [
            ("user", "What color palette is MIRA using for dark mode?"),
            ("ai", "MIRA uses a deep space palette (`#080c14` background), subtle zinc borders (`border-white/[0.08]`), cyan accents (`cyan-400`), and smooth glassmorphism blurs."),
        ]),
        ("Meeting Notes Extraction", [
            ("user", "Did you record any meeting action items from my afternoon Zoom call?"),
            ("ai", "Yes: 1) Finalize chat module pagination, 2) Verify Vault SQLite encrypted serialization, 3) Test client scroll performance."),
        ]),
        ("Desktop Application Permissions", [
            ("user", "Can I exclude password managers from screen capture?"),
            ("ai", "Yes, under Configurations > Apps & Permissions, you can toggle capture permission per application. Operator will skip capturing any window belonging to disabled apps."),
        ]),
        ("Tauri Shell Integration", [
            ("user", "What desktop shell is MIRA using?"),
            ("ai", "MIRA runs on Tauri v2 with a lightweight Rust shell, custom frameless window controls, and native drag regions."),
        ]),
        ("Local Memory Retention Policy", [
            ("user", "What retention period is recommended for screenshot data?"),
            ("ai", "The default is 'Never auto delete', but you can set retention to 3 months, 6 months, 1 year, 3 years, or 5 years in Vault configuration."),
        ]),
        ("System Health & Diagnostic Check", [
            ("user", "Run a diagnostic check on all services."),
            ("ai", "All services report healthy: Vault (online), Message Broker (online), Operator (online), Memory (online), Engine (online), Client (online)."),
        ]),
    ]

    seeded_sessions = []
    import datetime
    base_time = datetime.datetime.now(datetime.timezone.utc)

    for i, (topic, messages) in enumerate(sample_dialogues[:count]):
        session_id = str(uuid.uuid4())
        session_time = base_time - datetime.timedelta(hours=i * 2 + 1)
        for j, (role, text) in enumerate(messages):
            msg_time = session_time + datetime.timedelta(minutes=j * 3)
            time_str = msg_time.strftime("%Y-%m-%d %H:%M:%S")
            try:
                def _post(s_id=session_id, r=role, c=text, t=topic, ts=time_str):
                    requests.post(
                        f"{vault_base}/chats",
                        json={
                            "session_id": s_id,
                            "role": r,
                            "content": c,
                            "chat_name": t,
                            "created_at": ts,
                        },
                        timeout=3.0,
                    )
                await asyncio.to_thread(_post)
            except Exception as e:
                logger.debug(f"Seed message insert failed: {e}")
        seeded_sessions.append({"session_id": session_id, "chat_name": topic})

    return {
        "status": "success",
        "seeded_count": len(seeded_sessions),
        "sessions": seeded_sessions,
    }
