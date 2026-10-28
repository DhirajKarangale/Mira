from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from typing import Any, Callable, Dict, List, Optional
import numpy as np

try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False
    sd = None

from .stt_service import stt_service

logger = logging.getLogger("mira.engine.voice_stt.native_mic")

DEFAULT_WAKE_WORDS = [
    "mira", "mirror", "myra", "meera", "mera", "mirra", "miira",
    "miera", "mirah", "meira", "mayra", "amira", "ameera"
]

class NativeMicWorker:
    _instance: Optional[NativeMicWorker] = None

    def __init__(
        self,
        sample_rate: int = 16000,
        energy_threshold: float = 0.008,
        silence_threshold_s: float = 1.6,
    ):
        self.sample_rate = sample_rate
        self.energy_threshold = energy_threshold
        self.silence_threshold_s = silence_threshold_s

        self.stream: Optional[Any] = None
        self.is_running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Audio accumulation state
        self._audio_buffer: List[np.ndarray] = []
        self._is_speaking = False
        self._last_speech_time = 0.0
        self._speech_start_time = 0.0

        # Command collection state
        self.is_collecting_command = False
        self.collected_segments: List[str] = []
        self._command_silence_timer = 0.0

        # Event callbacks
        self._event_callbacks: List[Callable[[Dict[str, Any]], None]] = []

    @classmethod
    def get_instance(cls) -> NativeMicWorker:
        if cls._instance is None:
            cls._instance = NativeMicWorker()
        return cls._instance

    def add_event_listener(self, callback: Callable[[Dict[str, Any]], None]) -> Callable[[], None]:
        self._event_callbacks.append(callback)
        def remove():
            if callback in self._event_callbacks:
                self._event_callbacks.remove(callback)
        return remove

    def _broadcast_event(self, event_data: Dict[str, Any]) -> None:
        for cb in list(self._event_callbacks):
            try:
                cb(event_data)
            except Exception as e:
                logger.debug(f"[NativeMic] Error in event listener: {e}")

    def is_active(self) -> bool:
        return self.is_running and self.stream is not None

    def get_device_info(self) -> Dict[str, Any]:
        if not SOUNDDEVICE_AVAILABLE or sd is None:
            return {"available": False, "error": "sounddevice not installed"}
        try:
            default_in = sd.default.device[0]
            devices = sd.query_devices()
            device_name = devices[default_in]["name"] if 0 <= default_in < len(devices) else "Default"
            return {
                "available": True,
                "default_device_index": default_in,
                "device_name": device_name,
                "sample_rate": self.sample_rate,
                "is_running": self.is_running,
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    def start(self) -> bool:
        if self.is_running:
            return True
        if not SOUNDDEVICE_AVAILABLE or sd is None:
            logger.error("[NativeMic] Cannot start native mic: sounddevice is not installed.")
            return False

        # Ensure STT model is ready
        if not stt_service.is_ready():
            stt_service.initialize()

        self._stop_event.clear()
        self.is_running = True
        self.is_collecting_command = False
        self.collected_segments.clear()
        self._audio_buffer.clear()
        self._is_speaking = False

        self._thread = threading.Thread(target=self._run_mic_loop, daemon=True, name="NativeMicThread")
        self._thread.start()
        logger.info("[NativeMic] Native OS microphone recording thread started.")
        self._broadcast_event({"type": "mic_state", "state": "listening"})
        return True

    def stop(self) -> bool:
        if not self.is_running:
            return True
        self.is_running = False
        self._stop_event.set()

        if self.stream is not None:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception as e:
                logger.debug(f"[NativeMic] Stream close error: {e}")
            self.stream = None

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None

        self.is_collecting_command = False
        self.collected_segments.clear()
        self._audio_buffer.clear()
        self._is_speaking = False

        logger.info("[NativeMic] Native OS microphone recording stopped.")
        self._broadcast_event({"type": "mic_state", "state": "disabled"})
        return True

    def _run_mic_loop(self) -> None:
        block_size = 2048  # ~128ms per block at 16kHz
        try:
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                blocksize=block_size,
            )
            self.stream.start()

            while not self._stop_event.is_set():
                audio_block, overflowed = self.stream.read(block_size)
                if overflowed:
                    logger.debug("[NativeMic] Audio buffer overflowed.")

                self._process_audio_block(audio_block.flatten())

        except Exception as e:
            logger.error(f"[NativeMic] Exception in native mic loop: {e}", exc_info=True)
        finally:
            if self.stream:
                try:
                    self.stream.stop()
                    self.stream.close()
                except Exception:
                    pass
                self.stream = None
            self.is_running = False

    def _process_audio_block(self, block: np.ndarray) -> None:
        rms = float(np.sqrt(np.mean(block ** 2)))
        now = time.time()

        if rms > self.energy_threshold:
            # Voice energy detected
            if not self._is_speaking:
                self._is_speaking = True
                self._speech_start_time = now
                logger.debug(f"[NativeMic] Speech detected (RMS: {rms:.4f})")
            self._last_speech_time = now
            self._audio_buffer.append(block)
        else:
            # Silence
            if self._is_speaking:
                self._audio_buffer.append(block)
                silence_duration = now - self._last_speech_time

                if silence_duration >= self.silence_threshold_s:
                    # Silence threshold reached: end of speech segment!
                    self._is_speaking = False
                    self._handle_speech_segment()
                    self._audio_buffer.clear()

    def _handle_speech_segment(self) -> None:
        if not self._audio_buffer:
            return

        full_audio = np.concatenate(self._audio_buffer)
        duration_s = len(full_audio) / self.sample_rate

        # Ignore tiny clicks / pops under 0.4s
        if duration_s < 0.4:
            return

        try:
            result = stt_service.transcribe_audio(full_audio, language="en")
            raw_text = result.get("text", "").strip()
            if not raw_text:
                return

            logger.info(f"[NativeMic] Heard: \"{raw_text}\"")
            self._process_transcription(raw_text)
        except Exception as e:
            logger.error(f"[NativeMic] Transcription error: {e}", exc_info=True)

    def _process_transcription(self, text: str) -> None:
        clean = text.strip()
        lower = clean.lower()

        # Check for stop voice commands
        if lower in ["stop", "quiet", "quite", "mute", "mira stop", "shut up"]:
            logger.info(f"[NativeMic] Voice stop command detected: \"{clean}\"")
            self.is_collecting_command = False
            self.collected_segments.clear()
            self._broadcast_event({"type": "stop_playback", "command": clean})
            return

        # Check wake word
        wake_detected, command_part = self._detect_wake_word(clean)

        if wake_detected:
            self.is_collecting_command = True
            self._broadcast_event({
                "type": "wake_word_detected",
                "wake_word": "Mira",
                "command_part": command_part,
            })

            if command_part:
                self.collected_segments.append(command_part)
                self._evaluate_command_submission()
        elif self.is_collecting_command:
            # Already collecting command from previous segment
            self.collected_segments.append(clean)
            self._evaluate_command_submission()
        else:
            logger.debug(f"[NativeMic] Ignored speech prior to wake word: \"{clean}\"")

    def _detect_wake_word(self, text: str) -> Tuple[bool, str]:
        lower = text.lower()
        for w in DEFAULT_WAKE_WORDS:
            pattern = rf"\b(?:hey\s+|hi\s+|ok\s+|okay\s+)?{w}\b[,\s]*"
            match = re.search(pattern, lower)
            if match:
                # Extract command after wake word
                end_pos = match.end()
                command_part = text[end_pos:].strip()
                # Clean leading punctuation
                command_part = re.sub(r"^[,.:\-—?!]+\s*", "", command_part).strip()
                return True, command_part
        return False, ""

    def _evaluate_command_submission(self) -> None:
        full_command = " ".join(self.collected_segments).strip()
        if not full_command:
            return

        # Filter standalone greetings
        lower = full_command.lower().rstrip(".!?")
        if lower in ["hi", "hello", "hey", "good morning", "good evening", "howdy", "yo"]:
            logger.info(f"[NativeMic] Ignored standalone greeting: \"{full_command}\"")
            self.is_collecting_command = False
            self.collected_segments.clear()
            return

        logger.info(f"[NativeMic] Confirmed valid command from native OS mic: \"{full_command}\"")

        # Broadcast event to Client UI
        self._broadcast_event({
            "type": "command_submitted",
            "command": full_command,
            "timestamp": time.time(),
        })

        # Submit to Chat Engine asynchronously if available
        self._submit_to_chat_engine(full_command)

        # Reset command collector
        self.is_collecting_command = False
        self.collected_segments.clear()

    def _submit_to_chat_engine(self, command: str) -> None:
        import threading
        def _bg():
            try:
                import uuid
                import requests
                job_id = f"job-mic-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}"
                logger.info(f"[NativeMic] Submitting voice command to Chat Engine (job: {job_id}): \"{command}\"")

                # Submit to MIRA Engine Chat endpoint
                response = requests.post(
                    "http://127.0.0.1:9007/chats/message",
                    json={
                        "job_id": job_id,
                        "content": command,
                        "role": "user",
                        "generate_ai_reply": True,
                    },
                    timeout=12,
                )
                logger.info(f"[NativeMic] Voice command successfully posted to chat: status={response.status_code}")
            except Exception as e:
                logger.error(f"[NativeMic] Error submitting voice command to chat: {e}")

        threading.Thread(target=_bg, daemon=True).start()

native_mic = NativeMicWorker.get_instance()

