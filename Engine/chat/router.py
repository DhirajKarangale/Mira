from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional
import requests
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from .config import (
    CONSUMER_KEY_LLM_CHAT,
    CONSUMER_GROUP_LLM_CHAT,
    get_vault_base_url,
)
from .broker_client import (
    publish_chat_job,
    save_chat_to_vault,
    delete_session_from_vault,
    delete_all_sessions_from_vault,
    get_active_chat_sessions_broker,
    set_active_chat_session_broker,
    remove_active_chat_session_broker,
)
from .memory import clear_session_memory, clear_all_sessions_memory
from .websocket import ws_manager
from .worker import get_chat_status, start_chat_workers, stop_chat_workers
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.router")
router = APIRouter(prefix="", tags=["Chat"])


# ==============================================================================
# Pydantic Models
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
    job_id: Optional[str] = Field(None, description="Unique job identifier")
    session_id: Optional[str] = Field(None, description="Chat session UUID")
    content: str = Field(..., min_length=1, description="Message / query text")
    chat_name: Optional[str] = Field(None, description="Session name / title")
    role: Optional[str] = Field("user", description="'user' or 'ai'")
    generate_ai_reply: Optional[bool] = Field(True, description="Whether Engine should trigger LLM completion")


class SendChatMessageResponse(BaseModel):
    job_id: str
    session_id: str
    user_message: ChatMessageItem
    ai_message: Optional[ChatMessageItem] = None
    status: str = "queued"


class RenameChatSessionRequest(BaseModel):
    chat_name: str = Field(..., min_length=1, max_length=100, description="New chat session title")



# ==============================================================================
# WebSocket Endpoint
# ==============================================================================

@router.websocket("/ws/chat")
async def chat_websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            raw_text = await websocket.receive_text()
            if not raw_text:
                continue
            # Optionally handle client queries submitted over websocket
            try:
                import json
                msg = json.loads(raw_text)
                if isinstance(msg, dict) and msg.get("type") == "chat_query":
                    job_id = msg.get("job_id") or str(uuid.uuid4())
                    session_id = msg.get("session_id") or str(uuid.uuid4())
                    user_query = msg.get("content") or msg.get("user_query") or ""
                    chat_name = msg.get("chat_name")
                    if user_query:
                        publish_chat_job(
                            job_id=job_id,
                            session_id=session_id,
                            user_query=user_query,
                            extra_data={"chat_name": chat_name},
                        )
                        await websocket.send_json({
                            "type": "job_queued",
                            "job_id": job_id,
                            "session_id": session_id,
                        })
            except Exception as e:
                logger.debug(f"Error handling incoming websocket message: {e}")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket error: {e}")
        await ws_manager.disconnect(websocket)


# ==============================================================================
# Chat APIs
# ==============================================================================

@router.get(
    "/chats/sessions",
    response_model=ChatSessionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get All Chat Sessions",
)
async def get_chat_sessions_endpoint(
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
):
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
            return None

        result = await asyncio.to_thread(_fetch)
        if result:
            return result
    except Exception as e:
        logger.error(f"Error querying Vault for chat sessions: {e}")

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


@router.get(
    "/chats/sessions/{session_id}",
    response_model=ChatMessagesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Chats by Session",
)
async def get_chats_by_session_endpoint(
    session_id: str,
    limit: int = Query(30, ge=1, le=100, description="Items per page"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
):
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
            return None

        result = await asyncio.to_thread(_fetch)
        if result:
            return result
    except Exception as e:
        logger.error(f"Error querying Vault for messages of session '{clean_sid}': {e}")

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


@router.post(
    "/chats/message",
    response_model=SendChatMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit Chat Message and Queue AI Job",
)
async def send_chat_message_endpoint(request: SendChatMessageRequest):
    job_id = (request.job_id or str(uuid.uuid4())).strip()
    session_id = request.session_id.strip() if request.session_id and request.session_id.strip() else str(uuid.uuid4())
    content = request.content.strip()
    role = (request.role or "user").lower().strip()
    chat_name = request.chat_name.strip() if request.chat_name and request.chat_name.strip() else None

    # 1. Store user message in Vault immediately
    saved_user_msg = await asyncio.to_thread(
        save_chat_to_vault,
        session_id=session_id,
        role=role,
        content=content,
        chat_name=chat_name,
    )
    if not saved_user_msg:
        import time
        saved_user_msg = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": role,
            "content": content,
            "chat_name": chat_name,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    # 2. Queue job into llm_chat stream
    if role == "user" and request.generate_ai_reply:
        from config import CONFIG
        if not CONFIG.has_any_llm_key(force_refresh=True):
            log_error("[ChatRouter] Rejecting chat message: No LLM keys configured.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "NO_LLM_KEYS",
                    "message": "You don't have any LLM API keys configured. You cannot send messages until you add an LLM key in Configurations > AI Config.",
                    "route": "/configurations/ai-config",
                },
            )

        queued = await asyncio.to_thread(
            publish_chat_job,
            job_id=job_id,
            session_id=session_id,
            user_query=content,
            extra_data={
                "chat_name": chat_name,
                "user_message_id": saved_user_msg.get("id"),
                "user_message": saved_user_msg,
            },
        )
        if not queued:
            logger.warning(f"Failed to queue chat job {job_id} into Message Broker stream.")
        else:
            # Record in Redis active tracking for UI cross-screen persistence
            await asyncio.to_thread(
                set_active_chat_session_broker,
                session_id=session_id,
                job_id=job_id,
                user_query=content,
            )

    return {
        "job_id": job_id,
        "session_id": session_id,
        "user_message": saved_user_msg,
        "ai_message": None,
        "status": "queued",
    }


@router.get("/chats/pending", status_code=status.HTTP_200_OK, summary="Get Active / Pending Chat Sessions from Redis")
async def get_pending_chat_sessions_endpoint():
    active = await asyncio.to_thread(get_active_chat_sessions_broker)
    return {"status": "success", "pending_sessions": active}


@router.get("/chats/sessions/{session_id}/status", status_code=status.HTTP_200_OK, summary="Get Chat Session Generation Status")
async def get_chat_session_status_endpoint(session_id: str):
    clean_sid = (session_id or "").strip()
    active = await asyncio.to_thread(get_active_chat_sessions_broker)
    session_info = active.get(clean_sid) if isinstance(active, dict) else None
    return {
        "session_id": clean_sid,
        "is_generating": bool(session_info),
        "job_id": session_info.get("job_id") if isinstance(session_info, dict) else None,
        "details": session_info,
    }



@router.get("/chats/workers/status", status_code=status.HTTP_200_OK, summary="Get Chat Workers Status")
async def chat_workers_status_endpoint():
    return get_chat_status()


@router.post("/chats/workers/start", status_code=status.HTTP_200_OK, summary="Start Chat Workers")
async def start_chat_workers_endpoint():
    started = await start_chat_workers()
    return {"status": "started" if started else "already_running", "details": get_chat_status()}


@router.post("/chats/workers/stop", status_code=status.HTTP_200_OK, summary="Stop Chat Workers")
async def stop_chat_workers_endpoint():
    await stop_chat_workers()
    return {"status": "stopped", "details": get_chat_status()}


# ==============================================================================
# Helper API: Seed Sample Chat Sessions
# ==============================================================================

@router.post("/chats/seed", status_code=status.HTTP_200_OK, summary="Seed Initial Demo Chats")
async def seed_demo_chats_endpoint(count: int = Query(12, ge=1, le=30)):
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


@router.patch(
    "/chats/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Rename Chat Session",
)
async def rename_chat_session_endpoint(session_id: str, request: RenameChatSessionRequest):
    clean_sid = (session_id or "").strip()
    clean_name = (request.chat_name or "").strip()
    if not clean_sid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id cannot be empty")
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="chat_name cannot be empty")

    vault_base = get_vault_base_url()

    def _update():
        resp = requests.patch(
            f"{vault_base}/chats/sessions/{clean_sid}",
            json={"chat_name": clean_name},
            timeout=5.0,
        )
        return resp.status_code in (200, 201)

    try:
        success = await asyncio.to_thread(_update)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Failed to update chat session '{clean_sid}' in Vault",
            )
        await ws_manager.broadcast_chat_rename(session_id=clean_sid, chat_name=clean_name)
        return {"status": "success", "session_id": clean_sid, "chat_name": clean_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rename session '{clean_sid}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update session name: {str(e)}",
        )


@router.delete(
    "/chats/all",
    status_code=status.HTTP_200_OK,
    summary="Delete All Chat Sessions",
)
async def delete_all_chats_endpoint():
    try:
        vault_deleted = await asyncio.to_thread(delete_all_sessions_from_vault)
        await asyncio.to_thread(clear_all_sessions_memory)

        log(f"All chat sessions deleted (vault_ok={vault_deleted}).")
        return {
            "status": "success",
            "message": "All chat sessions and memories deleted successfully.",
        }
    except Exception as e:
        logger.error(f"Failed to delete all chats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete all chats: {str(e)}",
        )


@router.delete(
    "/chats/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Individual Chat Session",
)
async def delete_chat_session_endpoint(session_id: str):
    clean_sid = (session_id or "").strip()
    if not clean_sid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id cannot be empty")

    try:
        # 1. Delete from Vault
        vault_deleted = await asyncio.to_thread(delete_session_from_vault, clean_sid)
        # 2. Clear from Redis short-term memory
        await asyncio.to_thread(clear_session_memory, clean_sid)

        log(f"Chat session '{clean_sid}' deleted (vault_ok={vault_deleted}).")
        return {
            "status": "success",
            "session_id": clean_sid,
            "message": f"Chat session '{clean_sid}' deleted successfully.",
        }
    except Exception as e:
        logger.error(f"Failed to delete session '{clean_sid}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session '{clean_sid}': {str(e)}",
        )


