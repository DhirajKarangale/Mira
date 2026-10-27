/**
 * Mira Real-Time Speech Recognition & Transcription Utility
 * Powered by ElevenLabs Scribe v2 Realtime API
 *
 * Implements direct WebSocket streaming to ElevenLabs Scribe (model: scribe_v2_realtime)
 * with PCM16 16kHz audio capture, proactive API key rotation from `elevenlabs_keys.json`,
 * live audio signal level dispatching for wave animations, and persistence to `transcribe.json`.
 */

import { ttsKeyManager } from "./ttsKeyManager";

export interface TranscribeRecord {
  text: string;
  time: string;
  source?: "voice" | "chat";
}

export type TranscriptionCallback = (record: TranscribeRecord) => void;

/**
 * Resamples Float32 audio samples to 16,000Hz and converts to 16-bit linear PCM (Int16Array)
 */
function resampleAndConvertPCM16(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number = 16000
): Int16Array {
  if (inputSampleRate === targetSampleRate) {
    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(input.length / ratio);
  const pcm16 = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origIndex = Math.min(Math.floor(i * ratio), input.length - 1);
    const s = Math.max(-1, Math.min(1, input[origIndex]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Safely encodes Int16Array linear PCM into a Base64 string in chunks
 */
function pcm16ToBase64(pcm16: Int16Array): string {
  const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, len)) as unknown as number[]
    );
  }
  return btoa(binary);
}

class TranscribeManager {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private muteGainNode: GainNode | null = null;
  private websocket: WebSocket | null = null;

  private isListening = false;
  private isCapturingAudio = false;
  private isSwitchingKey = false;
  private isConnectingWebSocket = false;
  private shouldRestart = false;

  private reconnectTimer: any = null;
  private retryCount = 0;
  private callbacks: Set<TranscriptionCallback> = new Set();
  private lastTranscribedText = "";
  private lastTranscribedTime = 0;
  private isMutedDuringTTS = false;

  // Seamless hot-switch audio buffer: holds audio frames during key rotation so zero speech is lost
  private audioBufferQueue: string[] = [];

  constructor() {
    // Lazy initialization on start()
  }

  /**
   * Acquire a single-use token from ElevenLabs with infinite-ring key pool failover.
   * Guarantees that token acquisition never permanently ends or locks out mid-transcription.
   */
  private async acquireScribeToken(): Promise<{ token: string; key: string } | null> {
    const totalKeys = Math.max(7, ttsKeyManager.getState().totalKeys);
    let attempts = 0;
    // Allow up to 2 full loops across all keys in pool
    const maxAttempts = totalKeys * 2;

    while (attempts < maxAttempts && this.shouldRestart) {
      const apiKey = ttsKeyManager.getCurrentKey();
      if (!apiKey) {
        ttsKeyManager.rotateKey("No current key, cycling");
        attempts++;
        continue;
      }

      try {
        const response = await fetch(
          "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.token === "string") {
            return { token: data.token, key: apiKey };
          }
        }

        // Handle quota exhaustion or invalid key -> smoothly advance to next key in pool
        console.warn(
          `[ElevenLabs Scribe] Key ${apiKey.slice(0, 8)}... returned status ${response.status}. Smoothly switching to next pool key.`
        );
        ttsKeyManager.markKeyStatus(apiKey, "exhausted");
        ttsKeyManager.rotateKey(`Scribe token HTTP ${response.status}`);
      } catch (err) {
        console.warn("[ElevenLabs Scribe] Token fetch network error:", err);
        ttsKeyManager.rotateKey("Network error during token acquisition");
      }

      attempts++;

      // When a full round of keys was tried, reset all statuses and brief yield
      if (attempts === totalKeys) {
        ttsKeyManager.resetAllKeyStatuses();
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Fallback: reset all statuses to give the pool a fresh loop
    ttsKeyManager.resetAllKeyStatuses();
    return null;
  }

  /**
   * Cleans up microphone capture, AudioContext, and AudioNodes.
   * Only called on explicit user stop() - NEVER during key switching or reconnects!
   */
  private cleanupAudioNodes(): void {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
        this.processorNode.onaudioprocess = null;
      } catch {}
      this.processorNode = null;
    }

    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {}
      this.muteGainNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== "closed") {
          this.audioContext.close();
        }
      } catch {}
      this.audioContext = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
    }

    this.isCapturingAudio = false;
  }

  /**
   * Safely closes the WebSocket and cancels pending reconnects.
   * Does NOT touch audio nodes or microphone capture.
   */
  private cleanupWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.websocket) {
      try {
        this.websocket.onopen = null;
        this.websocket.onmessage = null;
        this.websocket.onerror = null;
        this.websocket.onclose = null;
        if (
          this.websocket.readyState === WebSocket.OPEN ||
          this.websocket.readyState === WebSocket.CONNECTING
        ) {
          this.websocket.close(1000, "Clean switch");
        }
      } catch {}
      this.websocket = null;
    }
  }

  /**
   * Initializes or reuses continuous microphone audio capture via Web Audio API.
   * Stays ALIVE across key rotations so mid-transcription speech is never interrupted.
   */
  private async ensureAudioCapture(): Promise<boolean> {
    if (
      this.isCapturingAudio &&
      this.mediaStream?.active &&
      this.audioContext &&
      this.audioContext.state !== "closed"
    ) {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => {});
      }
      return true;
    }

    try {
      // 1. Request user microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = stream;

      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      this.audioContext = audioCtx;

      // Ensure AudioContext is not stuck in suspended state
      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch((err) => {
          console.warn("[ElevenLabs Scribe] AudioContext resume failed:", err);
        });
      }

      // Hook user interactions to resume AudioContext if browser policy suspended it
      const resumeAudio = () => {
        if (this.audioContext && this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("click", resumeAudio, { once: true });
        window.addEventListener("keydown", resumeAudio, { once: true });
        window.addEventListener("touchstart", resumeAudio, { once: true });
      }

      const source = audioCtx.createMediaStreamSource(stream);
      this.sourceNode = source;

      // 4096 samples at 16kHz = ~256ms chunk
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      this.processorNode = processor;

      let lastAudioLog = 0;
      processor.onaudioprocess = (e) => {
        if (!this.shouldRestart) return;
        if (this.isMutedDuringTTS) {
          // While Mira is responding with voice, drop incoming mic frames to prevent echo loopback
          return;
        }

        const input = e.inputBuffer.getChannelData(0);

        // Calculate RMS volume level for UI signal waves
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const signalLevel = Math.min(1, rms * 6);
        const isSpeaking = signalLevel > 0.04;

        if (isSpeaking && Date.now() - lastAudioLog > 3000) {
          lastAudioLog = Date.now();
          console.log(
            `[ElevenLabs Scribe] Streaming audio (RMS: ${rms.toFixed(3)}, hardwareSampleRate: ${audioCtx.sampleRate}Hz, buffered: ${this.audioBufferQueue.length})`
          );
        }

        window.dispatchEvent(
          new CustomEvent("mira-audio-signal", {
            detail: { level: signalLevel, isSpeaking },
          })
        );

        // Convert audio samples to PCM16 at 16000Hz Base64
        const pcm16 = resampleAndConvertPCM16(input, audioCtx.sampleRate, 16000);
        const base64Audio = pcm16ToBase64(pcm16);

        // Check if WebSocket is open and ready to transmit
        if (
          this.websocket &&
          this.websocket.readyState === WebSocket.OPEN &&
          !this.isSwitchingKey &&
          !this.isConnectingWebSocket
        ) {
          // Flush any buffered chunks from previous key rotation first
          while (this.audioBufferQueue.length > 0) {
            const buffered = this.audioBufferQueue.shift()!;
            try {
              this.websocket.send(
                JSON.stringify({
                  message_type: "input_audio_chunk",
                  audio_base_64: buffered,
                })
              );
            } catch (err) {
              console.warn("[ElevenLabs Scribe] Error flushing buffered chunk:", err);
              break;
            }
          }

          // Send current live chunk
          try {
            this.websocket.send(
              JSON.stringify({
                message_type: "input_audio_chunk",
                audio_base_64: base64Audio,
              })
            );
          } catch (sendErr) {
            console.warn("[ElevenLabs Scribe] Send audio chunk error:", sendErr);
          }
        } else {
          // WebSocket is reconnecting or switching keys smoothly:
          // Buffer the audio frames so zero spoken speech is lost during rotation!
          if (this.audioBufferQueue.length < 150) {
            this.audioBufferQueue.push(base64Audio);
          }
        }
      };

      // Muted GainNode avoids acoustic speaker feedback
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      this.muteGainNode = muteGain;

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      this.isCapturingAudio = true;
      return true;
    } catch (err) {
      console.error("[ElevenLabs Scribe] Failed to start audio capture:", err);
      this.isCapturingAudio = false;
      return false;
    }
  }

  /**
   * Connects WebSocket to ElevenLabs Scribe without touching audio hardware capture
   */
  private async connectWebSocketOnly(): Promise<boolean> {
    if (!this.shouldRestart) return false;

    // 1. Fetch single-use token from ElevenLabs key pool
    const tokenRes = await this.acquireScribeToken();
    if (!tokenRes) {
      console.warn("[ElevenLabs Scribe] Retrying token acquisition in background...");
      this.scheduleReconnect(400);
      return false;
    }

    try {
      const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${encodeURIComponent(
        tokenRes.token
      )}&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=2.5&vad_threshold=0.4`;

      const ws = new WebSocket(wsUrl);
      this.websocket = ws;

      ws.onopen = () => {
        console.log(
          `[ElevenLabs Scribe] Real-time session connected (Key: ${tokenRes.key.slice(0, 8)}..., Buffered chunks to flush: ${this.audioBufferQueue.length})`
        );
        this.isListening = true;
        this.retryCount = 0;
        this.isSwitchingKey = false;
        this.isConnectingWebSocket = false;

        // Flush all buffered audio from key switch transition immediately!
        let flushedCount = 0;
        while (this.audioBufferQueue.length > 0) {
          const chunk = this.audioBufferQueue.shift()!;
          try {
            ws.send(
              JSON.stringify({
                message_type: "input_audio_chunk",
                audio_base_64: chunk,
              })
            );
            flushedCount++;
          } catch {}
        }
        if (flushedCount > 0) {
          console.log(
            `[ElevenLabs Scribe] Flushed ${flushedCount} audio chunks after key switch! Zero speech syllables lost.`
          );
        }

        window.dispatchEvent(
          new CustomEvent("mira-mic-state-change", { detail: { isListening: true } })
        );
      };

      ws.onmessage = async (event) => {
        if (this.isMutedDuringTTS) return;
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type || msg.message_type;

          // Partial interim transcript (live words as spoken)
          if (type === "partial_transcript" && msg.text) {
            window.dispatchEvent(
              new CustomEvent("mira-audio-signal", {
                detail: { level: 0.85, isSpeaking: true },
              })
            );
            window.dispatchEvent(
              new CustomEvent("mira-partial-transcription", { detail: { text: msg.text } })
            );
          }

          // Final committed transcript segment
          if (
            (type === "committed_transcript" ||
              type === "committed_transcript_with_timestamps") &&
            msg.text
          ) {
            const cleanedText = cleanAndFormatTranscript(msg.text);
            if (cleanedText) {
              const now = Date.now();
              // Prevent duplicate triggers within 800ms
              if (
                cleanedText.toLowerCase() === this.lastTranscribedText.toLowerCase() &&
                now - this.lastTranscribedTime < 800
              ) {
                return;
              }
              this.lastTranscribedText = cleanedText;
              this.lastTranscribedTime = now;

              const record: TranscribeRecord = {
                text: cleanedText,
                time: new Date().toISOString(),
                source: "voice",
              };

              console.log("[ElevenLabs Scribe] Voice captured:", record);

              // 1. Notify subscriber callbacks immediately (wake-word listener & manual dictation)
              this.callbacks.forEach((cb) => {
                try {
                  cb(record);
                } catch (e) {
                  console.error("[ElevenLabs Scribe] Callback error:", e);
                }
              });

              // Dispatch global event for listeners across all screens
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("mira-voice-heard", { detail: record })
                );
              }

              // 2. Only persist to transcribe.json if user explicitly speaks the wake-word "mira" / "meera"
              const hasWakeWord = /\b(mira|meera|mera|myra)\b/i.test(record.text);
              if (hasWakeWord) {
                await recordTranscription(record.text, record.time, "voice");
              }
            }
          }
        } catch (e) {
          console.warn("[ElevenLabs Scribe] Error parsing message:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("[ElevenLabs Scribe] WebSocket error:", err);
      };

      ws.onclose = (event) => {
        console.log(
          `[ElevenLabs Scribe] WebSocket closed (code: ${event.code}, reason: ${event.reason || "none"})`
        );
        if (this.shouldRestart) {
          // If closed due to quota error, timeout, or abnormal termination, smoothly switch key
          const isQuotaOrAbnormal =
            event.code === 1008 ||
            event.code === 4001 ||
            event.code === 1006 ||
            event.code === 1002 ||
            (event.reason && (event.reason.includes("quota") || event.reason.includes("unusual")));

          if (isQuotaOrAbnormal) {
            ttsKeyManager.markKeyStatus(tokenRes.key, "exhausted");
          }

          // Smoothly switch key with zero audio loss
          this.smoothSwitchKeyAndReconnect(`WebSocket closed (code ${event.code})`);
        } else {
          this.cleanupAudioNodes();
          this.isListening = false;
          window.dispatchEvent(
            new CustomEvent("mira-mic-state-change", { detail: { isListening: false } })
          );
          window.dispatchEvent(
            new CustomEvent("mira-audio-signal", { detail: { level: 0, isSpeaking: false } })
          );
        }
      };

      return true;
    } catch (err: any) {
      console.warn("[ElevenLabs Scribe] WebSocket initialization error:", err);
      this.smoothSwitchKeyAndReconnect("Initialization error");
      return false;
    }
  }

  /**
   * Smoothly switches to the next working ElevenLabs key in the pool without
   * interrupting microphone capture or dropping any user speech.
   */
  private async smoothSwitchKeyAndReconnect(reason: string): Promise<boolean> {
    if (!this.shouldRestart || this.isConnectingWebSocket) return false;

    this.isSwitchingKey = true;
    this.isConnectingWebSocket = true;

    console.warn(`[ElevenLabs Scribe] Smooth key switch initiated: ${reason}`);

    // 1. Close current WebSocket without stopping microphone capture
    this.cleanupWebSocket();

    // 2. Rotate to next key in the pool
    ttsKeyManager.rotateKey(reason);

    // 3. Keep audio capture going! Ensure mic is alive
    await this.ensureAudioCapture();

    // 4. Connect new WebSocket with next working key
    const success = await this.connectWebSocketOnly();
    this.isConnectingWebSocket = false;
    this.isSwitchingKey = false;

    return success;
  }

  /**
   * Schedule automatic reconnect with minimal backoff
   */
  private scheduleReconnect(delayMs?: number): void {
    if (!this.shouldRestart) return;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.retryCount++;
    const delay = delayMs || Math.min(100 + this.retryCount * 150, 1500);

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldRestart) {
        this.smoothSwitchKeyAndReconnect("Scheduled reconnect");
      }
    }, delay);
  }

  /**
   * Starts real-time listening via ElevenLabs Scribe v2 Realtime
   */
  public async start(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    if (this.shouldRestart && this.isListening) {
      return true;
    }

    this.shouldRestart = true;
    this.retryCount = 0;

    // 1. Start continuous audio capture (AudioContext & MediaStream)
    const audioOk = await this.ensureAudioCapture();
    if (!audioOk) {
      console.error("[ElevenLabs Scribe] Could not initialize audio capture.");
      return false;
    }

    // 2. Connect WebSocket with key pool
    return await this.connectWebSocketOnly();
  }

  /**
   * Stops real-time listening, cleanly closing microphone capture and WebSocket
   */
  public stop(): void {
    this.shouldRestart = false;
    this.retryCount = 0;
    this.isSwitchingKey = false;
    this.isConnectingWebSocket = false;
    this.audioBufferQueue = [];

    this.cleanupWebSocket();
    this.cleanupAudioNodes();
    this.isListening = false;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mira-mic-state-change", { detail: { isListening: false } })
      );
      window.dispatchEvent(
        new CustomEvent("mira-audio-signal", { detail: { level: 0, isSpeaking: false } })
      );
    }
  }

  public getIsListening(): boolean {
    return this.isListening || this.shouldRestart;
  }

  public setMutedDuringTTS(muted: boolean): void {
    this.isMutedDuringTTS = muted;
    if (!muted) {
      this.lastTranscribedText = "";
      this.lastTranscribedTime = 0;
    }
  }

  public getIsMutedDuringTTS(): boolean {
    return this.isMutedDuringTTS;
  }

  public onTranscription(callback: TranscriptionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
}

/**
 * Intelligent acoustic transcript formatter:
 * 1. Removes stuttered duplicate words
 * 2. Fixes lowercase personal pronouns (I, I'm, I'll, etc.)
 * 3. Enforces sentence capitalization and normalized whitespace
 */
export function cleanAndFormatTranscript(raw: string): string {
  let text = (raw || "").trim();
  if (!text) return "";

  // 1. Remove stuttered consecutive duplicate words (e.g., "the the" -> "the")
  text = text.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // 2. Fix lowercase standalone "i" and contractions
  text = text.replace(/\bi\b/g, "I");
  text = text.replace(/\bi'm\b/gi, "I'm");
  text = text.replace(/\bi'll\b/gi, "I'll");
  text = text.replace(/\bi've\b/gi, "I've");
  text = text.replace(/\bi'd\b/gi, "I'd");

  // 3. Ensure sentence starts with a capital letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // 4. Clean extra spaces
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

export const transcribeManager = new TranscribeManager();

/**
 * Record a transcription or chat item to transcribe.json
 */
export async function recordTranscription(
  text: string,
  time?: string,
  source: "voice" | "chat" = "voice"
): Promise<TranscribeRecord | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const record: TranscribeRecord = {
    text: trimmed,
    time: time || new Date().toISOString(),
    source,
  };

  // 1. Direct file write via Client's Vite dev / local server middleware
  try {
    await fetch("/api/save-transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn("[Transcribe] Vite direct save failed:", err);
  }

  // 2. Persist to localStorage cache
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("mira_transcriptions");
      let list: TranscribeRecord[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      const isDup = list.some(
        (existing) => existing.text === record.text && existing.time === record.time
      );
      if (!isDup) {
        list.push(record);
        if (list.length > 500) list = list.slice(list.length - 500);
        localStorage.setItem("mira_transcriptions", JSON.stringify(list));
      }
    }
  } catch {}

  // 3. Dispatch UI event so cards and badges update immediately
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mira-transcription", { detail: record }));
  }

  return record;
}

/**
 * Fetch all stored transcriptions from disk or localStorage with guaranteed cache-busting
 */
export async function getStoredTranscriptions(): Promise<TranscribeRecord[]> {
  try {
    const res = await fetch(`/api/get-transcribe?_t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("mira_transcriptions", JSON.stringify(data));
          }
        } catch {}
        return data;
      }
    }
  } catch (err) {
    console.warn("[Transcribe] Failed to fetch /api/get-transcribe:", err);
  }

  // Fallback to localStorage cache
  try {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("mira_transcriptions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}

  return [];
}
