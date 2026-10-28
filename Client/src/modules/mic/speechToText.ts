/**
 * ElevenLabs & Local Speech-to-Text Integration Adapter
 *
 * Provides backward-compatible interface for audio Blob transcription
 * by delegating to dedicated providers (OSNativeSTTProvider and ElevenLabsSTTProvider).
 * Strictly English language ("en").
 */

import { voiceToTextService } from "./voiceToTextService";
import type { TranscriptionResult, MicError } from "./types";

export const DEFAULT_STT_MODEL_ID = "scribe_v1";
export const DEFAULT_STT_LANGUAGE_CODE = "en"; // Strictly English only
export const LOCAL_STT_ENDPOINT = "http://127.0.0.1:9007/voice/stt/transcribe";
export const ELEVENLABS_STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

export interface STTOptions {
  modelId?: string;
  languageCode?: string;
  diarize?: boolean;
}

export class ElevenLabsSTT {
  private isTranscribing = false;

  public getIsTranscribing(): boolean {
    return this.isTranscribing;
  }

  /**
   * Transcribes audio Blob using voiceToTextService (Local Neural Faster-Whisper with ElevenLabs fallback).
   */
  public async transcribeAudio(
    audioBlob: Blob,
    _options?: STTOptions
  ): Promise<TranscriptionResult> {
    if (!audioBlob || audioBlob.size === 0) {
      return {
        text: "",
        durationMs: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();
    this.isTranscribing = true;

    try {
      const result = await voiceToTextService.transcribeAudioBlob(audioBlob);
      return {
        text: result.text,
        languageCode: result.language || "en",
        words: (result.words as any) || [],
        durationMs: result.durationMs || Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const message = (err as Error)?.message || "Speech transcription failed.";
      const micError: MicError = {
        type: message.toLowerCase().includes("quota") ? "quota_exhausted" : "transcription_error",
        message,
        timestamp: Date.now(),
      };
      (micError as any).isMicError = true;
      throw micError;
    } finally {
      this.isTranscribing = false;
    }
  }
}

export const elevenLabsSTT = new ElevenLabsSTT();
