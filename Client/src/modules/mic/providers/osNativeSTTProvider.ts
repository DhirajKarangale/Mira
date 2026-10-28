/**
 * OS Native Speech-to-Text Provider (Local On-Device Neural STT)
 *
 * Runs 100% locally on the host operating system via MIRA Engine (port 9007).
 * - Faster-Whisper (tiny.en) for high-speed neural transcription on CPU/GPU.
 * - Zero external API keys, zero quota usage, complete privacy.
 * - Strictly English language ("en").
 * - Also connects to host OS microphone event stream (ws://127.0.0.1:9007/voice/stt/events).
 */

import type {
  IVoiceToTextProvider,
  VoiceToTextResult,
  VoiceToTextCallback,
  VoiceToTextErrorCallback,
} from "./types";

export class OSNativeSTTProvider implements IVoiceToTextProvider {
  public readonly id = "os_native_stt";
  public readonly name = "OS Native Neural STT (Faster-Whisper)";
  public readonly description =
    "On-device neural transcription running locally on MIRA Engine (port 9007) with zero API keys and 100% privacy.";

  public static readonly TRANSCRIBE_ENDPOINT = "http://127.0.0.1:9007/voice/stt/transcribe";
  public static readonly STATUS_ENDPOINT = "http://127.0.0.1:9007/voice/stt/status";
  public static readonly WS_ENDPOINT = "ws://127.0.0.1:9007/voice/stt/events";

  private isRunning = false;
  private ws: WebSocket | null = null;
  private onTextCallback: VoiceToTextCallback | null = null;
  private onErrorCallback: VoiceToTextErrorCallback | null = null;
  private reconnectTimer: any = null;

  public isSupported(): boolean {
    // OS Native service is always supported on host machine via MIRA Engine
    return true;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Starts the OS Native STT provider.
   * Connects to the host event WebSocket to receive hardware mic wake word & command detections.
   */
  public async start(
    onText: VoiceToTextCallback,
    onError?: VoiceToTextErrorCallback
  ): Promise<void> {
    if (this.isRunning) return;

    this.onTextCallback = onText;
    this.onErrorCallback = onError || null;
    this.isRunning = true;

    this.connectWebSocket();
    console.log(`[OSNativeSTTProvider] Started and listening to local Engine (port 9007).`);
  }

  /**
   * Stops the OS Native STT provider and releases WebSocket connections.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.onTextCallback = null;
    this.onErrorCallback = null;
    console.log(`[OSNativeSTTProvider] Stopped.`);
  }

  /**
   * Transcribes an audio Blob locally on-device using MIRA Engine.
   * Strictly English only.
   */
  public async transcribeBlob(audioBlob: Blob): Promise<VoiceToTextResult> {
    if (!audioBlob || audioBlob.size === 0) {
      return {
        text: "",
        isFinal: true,
        provider: this.id,
        language: "en",
      };
    }

    const formData = new FormData();
    const ext = audioBlob.type.includes("webm")
      ? "webm"
      : audioBlob.type.includes("mp4")
      ? "mp4"
      : audioBlob.type.includes("ogg")
      ? "ogg"
      : "wav";
    formData.append("file", audioBlob, `audio.${ext}`);

    try {
      const res = await fetch(OSNativeSTTProvider.TRANSCRIBE_ENDPOINT, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new Error(`OS Native STT HTTP error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const text = (data.text || "")
        .replace(/\[.*?\]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const result: VoiceToTextResult = {
        text,
        isFinal: true,
        provider: this.id,
        language: "en", // Strictly English
        durationMs: data.duration_ms || 0,
        words: data.words || [],
      };

      if (text && this.onTextCallback) {
        this.onTextCallback(result);
      }

      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onErrorCallback?.(error);
      throw error;
    }
  }

  /**
   * Connects to the host OS microphone event stream in MIRA Engine.
   */
  private connectWebSocket(): void {
    if (typeof window === "undefined" || !this.isRunning) return;

    try {
      this.ws = new WebSocket(OSNativeSTTProvider.WS_ENDPOINT);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "command_submitted" && data.command) {
            this.onTextCallback?.({
              text: data.command,
              isFinal: true,
              provider: this.id,
              language: "en",
            });
          } else if (data.type === "wake_word_detected") {
            this.onTextCallback?.({
              text: "Mira",
              isFinal: true,
              provider: this.id,
              language: "en",
            });
          } else if (data.type === "stop_playback") {
            this.onTextCallback?.({
              text: "stop",
              isFinal: true,
              provider: this.id,
              language: "en",
            });
          }
        } catch (e) {
          console.debug("[OSNativeSTTProvider] Failed to parse WebSocket message:", e);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.isRunning) {
          this.reconnectTimer = setTimeout(() => {
            this.connectWebSocket();
          }, 5000);
        }
      };

      this.ws.onerror = (e) => {
        console.debug("[OSNativeSTTProvider] WebSocket notice:", e);
        this.onErrorCallback?.(new Error("Host STT WebSocket error."));
        try {
          this.ws?.close();
        } catch {}
      };
    } catch (err: unknown) {
      console.debug("[OSNativeSTTProvider] Could not connect to WebSocket:", err);
    }
  }
}

export const osNativeSTTProvider = new OSNativeSTTProvider();
