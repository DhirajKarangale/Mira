from __future__ import annotations

from .stt_service import stt_service, LocalSTTService
from .native_mic import native_mic, NativeMicWorker
from .router import router as voice_stt_router

def initialize_voice_stt():
    """
    Initializes the local Whisper STT model in background.
    """
    return stt_service.initialize()

def start_native_mic_if_enabled(auto_start: bool = False):
    """
    Starts native microphone if auto_start is true.
    """
    if auto_start:
        return native_mic.start()
    return False

def stop_native_mic():
    """
    Stops native microphone.
    """
    return native_mic.stop()

__all__ = [
    "stt_service",
    "LocalSTTService",
    "native_mic",
    "NativeMicWorker",
    "voice_stt_router",
    "initialize_voice_stt",
    "start_native_mic_if_enabled",
    "stop_native_mic",
]
