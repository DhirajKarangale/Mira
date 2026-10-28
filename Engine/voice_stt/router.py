from __future__ import annotations

import asyncio
import io
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from .stt_service import stt_service
from .native_mic import native_mic

logger = logging.getLogger("mira.engine.voice_stt.router")
router = APIRouter(prefix="/voice/stt", tags=["Native OS STT"])

# Connected WebSocket clients for real-time speech events
class STTEventBroadcaster:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._listener_removed = None

    def initialize(self):
        if self._listener_removed is None:
            self._listener_removed = native_mic.add_event_listener(self._on_mic_event)

    def _on_mic_event(self, event_data: Dict[str, Any]):
        if not self.active_connections:
            return
        asyncio.create_task(self.broadcast(event_data))

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"[STTEventBroadcaster] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"[STTEventBroadcaster] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: Dict[str, Any]):
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(ws)
        for dead_ws in disconnected:
            self.disconnect(dead_ws)

broadcaster = STTEventBroadcaster()
broadcaster.initialize()

class TranscribeResponse(BaseModel):
    text: str
    language: str
    duration_ms: int
    words: Optional[List[Dict[str, Any]]] = []
    model: str
    success: bool = True

class NativeMicStatusResponse(BaseModel):
    service: str = "Native OS STT (On-Device Neural Engine)"
    status: str
    model: str
    stt_ready: bool
    mic_running: bool
    device_info: Dict[str, Any]

@router.get("/status", response_model=NativeMicStatusResponse)
async def get_stt_status():
    device_info = native_mic.get_device_info()
    return NativeMicStatusResponse(
        status="online" if stt_service.is_ready() else "loading",
        model=f"faster-whisper-{stt_service.model_size}",
        stt_ready=stt_service.is_ready(),
        mic_running=native_mic.is_running,
        device_info=device_info,
    )

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_file(file: UploadFile = File(...)):
    """
    Transcribes an uploaded audio file/blob locally on-device via Faster-Whisper.
    Zero external API calls, zero ElevenLabs quota consumption, 100% private.
    """
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

        # Run transcription in thread to avoid blocking FastAPI event loop
        result = await asyncio.to_thread(
            stt_service.transcribe_audio,
            audio_bytes,
            "en",
        )

        return TranscribeResponse(
            text=result.get("text", ""),
            language=result.get("language", "en"),
            duration_ms=result.get("duration_ms", 0),
            words=result.get("words", []),
            model=result.get("model", "faster-whisper-tiny.en"),
            success=True,
        )
    except Exception as e:
        logger.error(f"[NativeSTT] Transcription endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Local on-device transcription failed: {str(e)}",
        )

@router.post("/mic/start")
async def start_native_microphone():
    """
    Activates native OS microphone continuous listening on the host machine.
    """
    success = await asyncio.to_thread(native_mic.start)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start native microphone stream.")
    return {"status": "started", "mic_running": True}

@router.post("/mic/stop")
async def stop_native_microphone():
    """
    Deactivates native OS microphone stream.
    """
    await asyncio.to_thread(native_mic.stop)
    return {"status": "stopped", "mic_running": False}

@router.post("/mic/toggle")
async def toggle_native_microphone():
    if native_mic.is_running:
        await asyncio.to_thread(native_mic.stop)
        return {"mic_running": False}
    else:
        success = await asyncio.to_thread(native_mic.start)
        return {"mic_running": success}

@router.websocket("/events")
async def websocket_stt_events(websocket: WebSocket):
    """
    WebSocket endpoint streaming live speech events from the native OS microphone.
    """
    await broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection open and accept any incoming control pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
    except Exception as e:
        logger.debug(f"[NativeSTT] WebSocket error: {e}")
        broadcaster.disconnect(websocket)

