from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect

from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.websocket")


class ChatWebSocketManager:
    """
    Manages active WebSocket connections for the Chat submodule,
    broadcasting LLM completion responses to connected Clients.
    """

    def __init__(self):
        self._active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._active_connections.append(websocket)
        log(f"[ChatWebSocket] Client connected. Active connections: {len(self._active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._active_connections:
                self._active_connections.remove(websocket)
        log(f"[ChatWebSocket] Client disconnected. Active connections: {len(self._active_connections)}")

    async def broadcast_chat_response(
        self,
        job_id: str,
        session_id: str,
        user_message: Dict[str, Any],
        ai_message: Optional[Dict[str, Any]] = None,
        status: str = "completed",
        error: Optional[str] = None,
    ) -> int:
        """
        Broadcast completed LLM response to all connected WebSocket clients.
        """
        payload: Dict[str, Any] = {
            "type": "chat_response",
            "job_id": str(job_id),
            "session_id": str(session_id),
            "user_message": user_message,
            "ai_message": ai_message,
            "status": status,
        }
        if error:
            payload["error"] = error

        message_str = json.dumps(payload)
        sent_count = 0
        dead_connections: List[WebSocket] = []

        async with self._lock:
            for connection in self._active_connections:
                try:
                    await connection.send_text(message_str)
                    sent_count += 1
                except Exception as e:
                    logger.debug(f"Failed to send to client: {e}")
                    dead_connections.append(connection)

            for dead in dead_connections:
                if dead in self._active_connections:
                    self._active_connections.remove(dead)

        log(f"[ChatWebSocket] Broadcasted response for job={job_id} to {sent_count} client(s).")
        return sent_count

    def get_connections_count(self) -> int:
        return len(self._active_connections)


ws_manager = ChatWebSocketManager()
