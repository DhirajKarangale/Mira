from __future__ import annotations

import io
import logging
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    WhisperModel = None

logger = logging.getLogger("mira.engine.voice_stt.service")

class LocalSTTService:
    _instance: Optional[LocalSTTService] = None

    def __init__(self, model_size: str = "tiny.en", device: str = "cpu", compute_type: str = "int8"):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model: Optional[WhisperModel] = None
        self._is_loading = False

    @classmethod
    def get_instance(cls) -> LocalSTTService:
        if cls._instance is None:
            cls._instance = LocalSTTService()
        return cls._instance

    def initialize(self) -> bool:
        if self.model is not None:
            return True
        if not FASTER_WHISPER_AVAILABLE:
            logger.error("[LocalSTT] faster-whisper is not installed.")
            return False

        if self._is_loading:
            return False

        try:
            self._is_loading = True
            logger.info(f"[LocalSTT] Loading faster-whisper '{self.model_size}' model on {self.device} ({self.compute_type})...")
            start_t = time.time()
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=4,
            )
            elapsed = time.time() - start_t
            logger.info(f"[LocalSTT] Model '{self.model_size}' loaded successfully in {elapsed:.2f}s.")
            return True
        except Exception as e:
            logger.error(f"[LocalSTT] Failed to load faster-whisper model: {e}", exc_info=True)
            return False
        finally:
            self._is_loading = False

    def is_ready(self) -> bool:
        return self.model is not None

    def transcribe_audio(
        self,
        audio_input: Union[bytes, io.BytesIO, np.ndarray, str],
        language: str = "en",
        beam_size: int = 1,
        vad_filter: bool = True,
    ) -> Dict[str, Any]:
        """
        Transcribes audio from bytes, numpy float32 array, or file path.
        Returns dict with text, language, words, and duration_ms.
        """
        if not self.is_ready():
            success = self.initialize()
            if not success or self.model is None:
                raise RuntimeError("Local STT model is not loaded or faster-whisper unavailable.")

        t_start = time.time()

        # Handle raw bytes: write to in-memory BytesIO
        if isinstance(audio_input, bytes):
            audio_source = io.BytesIO(audio_input)
        else:
            audio_source = audio_input

        try:
            segments, info = self.model.transcribe(
                audio_source,
                beam_size=beam_size,
                language=language,
                vad_filter=vad_filter,
                vad_parameters=dict(min_silence_duration_ms=400),
            )

            text_segments = []
            words_list = []
            for segment in segments:
                clean_seg = segment.text.strip()
                if clean_seg:
                    text_segments.append(clean_seg)
                if hasattr(segment, "words") and segment.words:
                    for w in segment.words:
                        words_list.append({
                            "word": w.word,
                            "start": w.start,
                            "end": w.end,
                            "probability": getattr(w, "probability", 1.0)
                        })

            full_text = " ".join(text_segments).strip()
            # Clean brackets and whitespace
            import re
            full_text = re.sub(r"\[.*?\]", "", full_text)
            full_text = re.sub(r"\s+", " ", full_text).strip()

            duration_ms = int((time.time() - t_start) * 1000)

            logger.info(
                f"[LocalSTT] Transcribed ({duration_ms}ms, lang={info.language}): \"{full_text}\""
            )

            return {
                "text": full_text,
                "language": info.language or language,
                "duration_ms": duration_ms,
                "words": words_list,
                "model": f"faster-whisper-{self.model_size}",
            }
        except Exception as e:
            logger.error(f"[LocalSTT] Transcription failed: {e}", exc_info=True)
            raise

stt_service = LocalSTTService.get_instance()

