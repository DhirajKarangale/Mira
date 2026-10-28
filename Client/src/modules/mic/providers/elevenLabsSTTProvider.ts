/**
 * ElevenLabs Speech-to-Text Provider (Cloud STT)
 *
 * Transcribes audio Blobs using the ElevenLabs Scribe STT API.
 * - Handles automatic round-robin API key rotation on 401 (auth), 402 (quota exceeded), or 429 (rate limit).
 * - Strictly English language ("en").
 * - Notifies UI via toast on key rotation or when all keys are exhausted.
 */

import { useVoiceStore } from "@/store/useVoiceStore";
import { isKeyRotationError } from "@/modules/voice/elevenlabsClient";
import { keyQuotaManager } from "@/modules/voice/keyQuotaManager";
import type {
  IVoiceToTextProvider,
  VoiceToTextResult,
  VoiceToTextCallback,
  VoiceToTextErrorCallback,
} from "./types";

export const DEFAULT_ELEVENLABS_STT_MODEL = "scribe_v1";
export const DEFAULT_ELEVENLABS_LANGUAGE = "en"; // Strictly English only
export const ELEVENLABS_STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

export class ElevenLabsSTTProvider implements IVoiceToTextProvider {
  public readonly id = "elevenlabs_stt";
  public readonly name = "ElevenLabs Scribe STT (Cloud)";
  public readonly description =
    "Cloud speech transcription with automatic round-robin API key rotation and quota management.";

  private isRunning = false;
  private isScribeSTTAvailable = true;
  private onTextCallback: VoiceToTextCallback | null = null;
  private onErrorCallback: VoiceToTextErrorCallback | null = null;

  public isSupported(): boolean {
    if (!this.isScribeSTTAvailable) return false;
    const store = useVoiceStore.getState();
    const keys = keyQuotaManager.filterValidKeyList(store.keys);
    return keys.length > 0;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public resetAvailability(): void {
    this.isScribeSTTAvailable = true;
  }

  public async start(
    onText: VoiceToTextCallback,
    onError?: VoiceToTextErrorCallback
  ): Promise<void> {
    this.onTextCallback = onText;
    this.onErrorCallback = onError || null;
    this.isRunning = true;
    console.log(`[ElevenLabsSTTProvider] Started and ready for audio transcription.`);
  }

  public stop(): void {
    this.isRunning = false;
    this.onTextCallback = null;
    this.onErrorCallback = null;
    console.log(`[ElevenLabsSTTProvider] Stopped.`);
  }

  /**
   * Transcribes an audio Blob using ElevenLabs Scribe STT with automatic key rotation.
   * If Scribe STT is not supported on the user's account tier, gracefully falls back to OS Native Neural STT.
   */
  public async transcribeBlob(audioBlob: Blob): Promise<VoiceToTextResult> {
    if (!audioBlob || audioBlob.size === 0) {
      return {
        text: "",
        isFinal: true,
        provider: this.id,
        language: DEFAULT_ELEVENLABS_LANGUAGE,
      };
    }

    if (!this.isScribeSTTAvailable) {
      throw new Error(
        "ElevenLabs Scribe STT is unavailable on current account keys. Using OS Native Neural STT."
      );
    }

    const voiceStore = useVoiceStore.getState();
    const rawKeys = voiceStore.keys.map((k) => k?.trim()).filter(Boolean);
    const keys = keyQuotaManager.filterValidKeyList(rawKeys);

    if (keys.length === 0) {
      const err = new Error("No active ElevenLabs API keys configured in Vault / Voice Settings.");
      this.onErrorCallback?.(err);
      throw err;
    }

    const totalKeys = keys.length;
    const initialKeyIndex = Math.max(0, Math.min(voiceStore.currentKeyIndex, totalKeys - 1));
    let currentAttempt = 0;

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
        formData.append("model_id", DEFAULT_ELEVENLABS_STT_MODEL);
        formData.append("language_code", DEFAULT_ELEVENLABS_LANGUAGE);

        console.log(
          `[ElevenLabsSTTProvider] Transcribing (${Math.round(audioBlob.size / 1024)} KB) using key #${
            activeKeyIndex + 1
          }/${totalKeys}...`
        );

        const response = await fetch(ELEVENLABS_STT_ENDPOINT, {
          method: "POST",
          headers: {
            "xi-api-key": activeApiKey,
          },
          body: formData,
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const data = await response.json();
          const text = (data.text || "")
            .replace(/\[.*?\]/g, "")
            .replace(/\s+/g, " ")
            .trim();

          if (activeKeyIndex !== voiceStore.currentKeyIndex) {
            useVoiceStore.setState({ currentKeyIndex: activeKeyIndex });
          }

          const result: VoiceToTextResult = {
            text,
            isFinal: true,
            provider: this.id,
            language: DEFAULT_ELEVENLABS_LANGUAGE,
            words: data.words || [],
          };

          if (text && this.onTextCallback) {
            this.onTextCallback(result);
          }

          return result;
        }

        const statusCode = response.status;
        const errorText = await response.text().catch(() => "");
        const isRotatable = isKeyRotationError(statusCode, errorText);

        if (isRotatable) {
          if (currentAttempt < totalKeys - 1) {
            const nextKeyIndex = (activeKeyIndex + 1) % totalKeys;
            console.warn(
              `[ElevenLabsSTTProvider] Key #${activeKeyIndex + 1} Scribe STT notice (${statusCode}). Trying next key #${
                nextKeyIndex + 1
              }...`
            );
            currentAttempt++;
            continue;
          } else {
            // Scribe STT is not active on these keys; disable Scribe STT provider and let VoiceToTextService fall back to OS Native STT
            console.warn(
              `[ElevenLabsSTTProvider] Scribe STT is not supported or out of credits on these keys. Falling back to local OS Native Neural STT.`
            );
            this.isScribeSTTAvailable = false;
            throw new Error(
              "ElevenLabs Scribe STT unavailable on these keys. Switched to local OS Native Neural STT."
            );
          }
        }

        throw new Error(`ElevenLabs STT HTTP ${statusCode}: ${errorText || response.statusText}`);
      } catch (err: unknown) {
        if (currentAttempt < totalKeys - 1) {
          currentAttempt++;
          continue;
        }

        this.isScribeSTTAvailable = false;
        const error = err instanceof Error ? err : new Error(String(err));
        this.onErrorCallback?.(error);
        throw error;
      }
    }

    this.isScribeSTTAvailable = false;
    throw new Error(
      "ElevenLabs Scribe STT unavailable on current keys. Using local OS Native Neural STT."
    );
  }
}

export const elevenLabsSTTProvider = new ElevenLabsSTTProvider();

