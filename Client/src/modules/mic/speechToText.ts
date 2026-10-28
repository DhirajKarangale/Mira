/**
 * ElevenLabs Speech-to-Text Integration
 * Transcribes audio Blobs using the ElevenLabs Scribe STT API.
 * Reuses existing ElevenLabs API keys with automatic round-robin key rotation
 * on authentication (401), rate limits (429), or quota exhaustion (402).
 */

import { useVoiceStore } from "@/store/useVoiceStore";
import { isKeyRotationError } from "@/modules/voice/elevenlabsClient";
import { toast, MessageBarColor } from "@/components";
import type { TranscriptionResult, MicError } from "./types";

export const DEFAULT_STT_MODEL_ID = "scribe_v1";
export const DEFAULT_STT_LANGUAGE_CODE = "en"; // Strictly consider language as English only
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
   * Sends an audio Blob to ElevenLabs Speech-to-Text endpoint.
   * Handles automatic key rotation across all configured ElevenLabs keys in Vault/Store.
   */
  public async transcribeAudio(
    audioBlob: Blob,
    options?: STTOptions
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

    // 1. Primary: Native On-Device Neural STT (Faster-Whisper on Engine)
    // 100% offline, zero API keys, no quota exhaustion
    try {
      const localFormData = new FormData();
      const ext = audioBlob.type.includes("webm")
        ? "webm"
        : audioBlob.type.includes("mp4")
        ? "mp4"
        : audioBlob.type.includes("ogg")
        ? "ogg"
        : "wav";
      localFormData.append("file", audioBlob, `audio.${ext}`);

      const localRes = await fetch(LOCAL_STT_ENDPOINT, {
        method: "POST",
        body: localFormData,
        signal: AbortSignal.timeout(8000),
      });

      if (localRes.ok) {
        const localData = await localRes.json();
        const text = (localData.text || "")
          .replace(/\[.*?\]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        console.log(
          `[Local Neural STT] Transcribed on-device (${localData.duration_ms || 0}ms, model: ${
            localData.model || "faster-whisper"
          }): "${text}" (0 API keys used)`
        );

        return {
          text,
          languageCode: localData.language || "en",
          words: localData.words || [],
          durationMs: localData.duration_ms || Date.now() - startTime,
          timestamp: Date.now(),
        };
      }
    } catch (localErr) {
      console.debug(
        "[Local Neural STT] Local endpoint offline/unreachable; trying ElevenLabs fallback:",
        localErr
      );
    }

    // 2. Fallback: ElevenLabs STT with round-robin key rotation
    const voiceStore = useVoiceStore.getState();
    const keys = voiceStore.keys.map((k) => k?.trim()).filter(Boolean);

    if (keys.length === 0) {
      throw this.createMicError(
        "auth_error",
        "Local STT unreachable and no ElevenLabs API keys configured. Please start Engine service or add an ElevenLabs key."
      );
    }

    const targetModelId = options?.modelId || DEFAULT_STT_MODEL_ID;
    const initialKeyIndex = Math.max(
      0,
      Math.min(voiceStore.currentKeyIndex, keys.length - 1)
    );

    let currentAttempt = 0;
    const totalKeys = keys.length;

    try {
      while (currentAttempt < totalKeys) {
        const activeKeyIndex = (initialKeyIndex + currentAttempt) % totalKeys;
        const activeApiKey = keys[activeKeyIndex];

        try {
          const formData = new FormData();
          const extension = audioBlob.type.includes("webm")
            ? "webm"
            : audioBlob.type.includes("mp4")
            ? "mp4"
            : audioBlob.type.includes("ogg")
            ? "ogg"
            : "wav";

          formData.append("file", audioBlob, `speech.${extension}`);
          formData.append("model_id", targetModelId);

          // Strictly consider language as English only
          const languageCode = options?.languageCode || DEFAULT_STT_LANGUAGE_CODE;
          formData.append("language_code", languageCode);

          if (options?.diarize !== undefined) {
            formData.append("diarize", String(options.diarize));
          }

          console.log(
            `[ElevenLabs STT] Sending audio (${Math.round(
              audioBlob.size / 1024
            )} KB) using key #${activeKeyIndex + 1} (model: ${targetModelId}, lang: ${languageCode})`
          );

          const response = await fetch(ELEVENLABS_STT_ENDPOINT, {
            method: "POST",
            headers: {
              "xi-api-key": activeApiKey,
            },
            body: formData,
          });

          // Handle Success
          if (response.ok) {
            const resultData = await response.json();
            const detectedLang = (resultData.language_code || "").toLowerCase();

            // Strictly consider language as English only: drop non-English speech
            if (detectedLang && !detectedLang.startsWith("en")) {
              console.log(
                `[ElevenLabs STT] Dropped non-English transcription (detected: ${detectedLang}): "${resultData.text}"`
              );
              return {
                text: "",
                languageCode: resultData.language_code,
                words: [],
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
              };
            }

            const text = (resultData.text || "")
              .replace(/\[.*?\]/g, "")
              .replace(/\s+/g, " ")
              .trim();

            console.log(
              `[ElevenLabs STT] Received transcription with key #${
                activeKeyIndex + 1
              }: "${text}"`
            );

            // If we rotated away from previous key index, synchronize store
            if (activeKeyIndex !== voiceStore.currentKeyIndex) {
              useVoiceStore
                .getState()
                .updateKeyIndex(activeKeyIndex)
                .catch((err) => {
                  console.debug("[ElevenLabs STT] Synchronized active key index:", err);
                });
            }

            return {
              text,
              languageCode: resultData.language_code,
              words: resultData.words || [],
              durationMs: Date.now() - startTime,
              timestamp: Date.now(),
            };
          }

          // Handle HTTP Error
          let errorPayload: unknown;
          try {
            errorPayload = await response.json();
          } catch {
            try {
              errorPayload = await response.text();
            } catch {
              errorPayload = null;
            }
          }

          const rotationCheck = isKeyRotationError(response.status, errorPayload);

          if (rotationCheck.shouldRotate) {
            const nextKeyIndex = (activeKeyIndex + 1) % totalKeys;
            console.warn(
              `[ElevenLabs STT] Key #${activeKeyIndex + 1} exhausted/unauthorized (${
                rotationCheck.reason
              }). Automatically rotating to next Key #${nextKeyIndex + 1} (${currentAttempt + 1}/${totalKeys}).`
            );

            // Immediately persist pointer to the next active key in Store and Vault so subsequent requests don't start at dead keys
            useVoiceStore
              .getState()
              .updateKeyIndex(nextKeyIndex)
              .catch((err) => {
                console.debug("[ElevenLabs STT] Failed to persist rotated key index:", err);
              });

            toast.info(
              `ElevenLabs Key #${activeKeyIndex + 1} expired/exhausted. Automatically switched to Key #${nextKeyIndex + 1}.`,
              {
                title: "API Key Rotated",
                color: MessageBarColor.Cyan,
                duration: 4000,
              }
            );

            currentAttempt++;
            continue;
          }

          // Non-rotatable HTTP error
          const errMessage =
            typeof errorPayload === "object" && errorPayload !== null
              ? JSON.stringify(errorPayload)
              : String(errorPayload || response.statusText);

          throw this.createMicError(
            "transcription_error",
            `ElevenLabs STT HTTP ${response.status}: ${errMessage}`
          );
        } catch (innerErr: unknown) {
          const msg = (innerErr as Error)?.message || "";

          // Propagate already wrapped MicError
          if ((innerErr as { isMicError?: boolean })?.isMicError) {
            throw innerErr;
          }

          // Check if abort or network failure
          if (
            (innerErr as Error)?.name === "AbortError" ||
            (innerErr as Error)?.name === "TypeError"
          ) {
            throw this.createMicError(
              "network_error",
              `ElevenLabs STT network connection error: ${msg || "Service unreachable"}`,
              innerErr
            );
          }

          throw innerErr;
        }
      }

      // If loop finished, all keys exhausted
      throw this.createMicError(
        "quota_exhausted",
        `All configured ElevenLabs API keys (${totalKeys}) failed due to expired, invalid, or exhausted quotas.`
      );
    } finally {
      this.isTranscribing = false;
    }
  }

  private createMicError(
    type: MicError["type"],
    message: string,
    originalError?: unknown
  ): Error & { isMicError: boolean; type: MicError["type"]; originalError?: unknown } {
    const error = new Error(message) as Error & {
      isMicError: boolean;
      type: MicError["type"];
      originalError?: unknown;
    };
    error.isMicError = true;
    error.type = type;
    error.originalError = originalError;
    return error;
  }
}

export const elevenLabsSTT = new ElevenLabsSTT();
