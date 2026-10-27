/**
 * Unified ElevenLabs Text-to-Speech (TTS) Service
 *
 * Orchestrates:
 * 1. Dedicated asynchronous Web Worker for ~100-char chunking and ElevenLabs streaming
 * 2. Gapless Web Audio API scheduler for seamless "one stroke" playback
 * 3. Automatic JSON array API key rotation upon token/quota expiration
 * 4. Fallback pipeline if Web Workers are restricted in Tauri/WebView
 */

import { ttsAudioPlayer, type PlaybackState } from "./ttsAudioPlayer";
import { ttsKeyManager } from "./ttsKeyManager";
import { smartChunkText, type TTSChunk } from "./ttsChunker";
import {
  DEFAULT_VOICE_ID,
  ELEVENLABS_VOICES,
  type TTSVoice,
} from "./ttsVoices";

export interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  onChunkStart?: (chunkIndex: number, total: number, text: string) => void;
  onFinish?: () => void;
  onError?: (err: any) => void;
}

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentChunk: number;
  totalChunks: number;
  activeText: string;
  currentKeyIndex: number;
  selectedVoiceId: string;
}

type StateListener = (state: TTSState) => void;

class TTSService {
  private worker: Worker | null = null;
  private isSynthesizing: boolean = false;
  private activeText: string = "";
  private currentOptions: TTSOptions | null = null;
  private listeners: Set<StateListener> = new Set();
  private plannedChunks: TTSChunk[] = [];
  private activeAbortController: AbortController | null = null;
  private selectedVoiceId: string = DEFAULT_VOICE_ID;

  constructor() {
    this.initVoiceSelection();
    this.initWorker();
    this.subscribeAudioPlayer();
  }

  private initVoiceSelection() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("mira_selected_tts_voice_id");
        if (stored && ELEVENLABS_VOICES.some((v) => v.id === stored)) {
          this.selectedVoiceId = stored;
        }
      } catch {}
    }
  }

  private initWorker() {
    if (typeof window === "undefined") return;

    try {
      this.worker = new Worker(new URL("./tts.worker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = (event: MessageEvent) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (err) => {
        console.warn("[TTSService] Worker failed, falling back to direct async pipeline:", err);
        this.worker = null;
      };
    } catch (e) {
      console.warn("[TTSService] Worker creation failed, using direct async fallback:", e);
      this.worker = null;
    }
  }

  private subscribeAudioPlayer() {
    ttsAudioPlayer.onStateChange((state: PlaybackState) => {
      if (this.currentOptions?.onChunkStart && state.currentChunkIndex > 0) {
        const chunk = this.plannedChunks[state.currentChunkIndex - 1];
        if (chunk) {
          this.currentOptions.onChunkStart(
            state.currentChunkIndex,
            state.totalChunks,
            chunk.text
          );
        }
      }
      this.notifyListeners();
    });
  }

  private handleWorkerMessage(data: any) {
    switch (data.type) {
      case "CHUNKS_PLANNED":
        this.plannedChunks = data.chunks || [];
        ttsAudioPlayer.prepare(data.total, () => {
          this.handleSessionFinished();
        });
        this.notifyListeners();
        break;

      case "CHUNK_AUDIO":
        if (data.audioBuffer) {
          ttsAudioPlayer.enqueueChunkAudio(data.index, data.audioBuffer, data.text);
        }
        break;

      case "KEY_ROTATED":
        ttsKeyManager.rotateKey(data.reason);
        this.notifyListeners();
        break;

      case "USAGE_RECORDED":
        if (data.key && data.charsUsed) {
          ttsKeyManager.recordUsage(data.key, data.charsUsed);
          this.notifyListeners();
        }
        break;

      case "KEY_STATUS_CHANGED":
        if (data.key && data.status) {
          ttsKeyManager.markKeyStatus(data.key, data.status);
          this.notifyListeners();
        }
        break;

      case "VOICE_FALLBACK":
        console.warn(`[TTSService] Voice fallback triggered: ${data.reason}`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("mira:tts-voice-fallback", { detail: data })
          );
        }
        break;

      case "SYNTHESIS_COMPLETE":
        this.isSynthesizing = false;
        ttsKeyManager.markSuccess();
        this.notifyListeners();
        break;

      case "SYNTHESIS_ERROR":
        console.error("[TTSService] Synthesis error:", data.message);
        this.stop();
        if (this.currentOptions?.onError) {
          this.currentOptions.onError(new Error(data.message));
        }
        break;
    }
  }

  /**
   * Speak input text using ~100-character chunking and gapless streaming audio
   */
  public async speak(text: string, options: TTSOptions = {}): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Stop any existing playback session
    this.stop();

    this.activeText = trimmed;
    this.currentOptions = options;
    this.isSynthesizing = true;
    this.notifyListeners();

    const keys = ttsKeyManager.getAllKeys();
    const activeKeyIndex = ttsKeyManager.getState().currentIndex;
    const keysUsage = ttsKeyManager.getAllKeyUsage();
    const voiceId = options.voiceId || this.selectedVoiceId;

    if (this.worker) {
      this.worker.postMessage({
        type: "START_SYNTHESIS",
        text: trimmed,
        voiceId,
        modelId: options.modelId,
        keys,
        activeKeyIndex,
        keysUsage,
      });
    } else {
      // Direct async fallback pipeline (if Web Worker restricted in WebView)
      await this.directSynthesisPipeline(trimmed, { ...options, voiceId }, keys);
    }
  }

  /**
   * Fallback pipeline: runs if Web Worker is not available
   */
  private async directSynthesisPipeline(
    text: string,
    options: TTSOptions,
    keys: string[]
  ): Promise<void> {
    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    const chunks = smartChunkText(text, 100);
    this.plannedChunks = chunks;
    ttsAudioPlayer.prepare(chunks.length, () => {
      this.handleSessionFinished();
    });

    const voiceId = options.voiceId || this.selectedVoiceId;
    const modelId = options.modelId || "eleven_turbo_v2_5";

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) break;

        const chunk = chunks[i];
        const chunkCost = chunk.charCount || chunk.text.length || 100;
        let attempts = 0;
        let audioBuffer: ArrayBuffer | null = null;

        while (attempts < keys.length) {
          if (signal.aborted) break;

          // Proactive Pre-Exhaustion Check
          let key = ttsKeyManager.getCurrentKey();
          if (ttsKeyManager.isAboutToExhaust(key, chunkCost) && keys.length > 1) {
            ttsKeyManager.rotateKey("Proactive pre-exhaustion rotation (~8,800 chars threshold)");
            key = ttsKeyManager.getCurrentKey();
          }

          const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3`;

          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "xi-api-key": key,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text: chunk.text,
                model_id: modelId,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
              }),
              signal,
            });

            if (res.ok) {
              audioBuffer = await res.arrayBuffer();
              ttsKeyManager.recordUsage(key, chunkCost);
              ttsKeyManager.markSuccess();
              break;
            }

            if (res.status === 401) {
              ttsKeyManager.markKeyStatus(key, "invalid");
              ttsKeyManager.rotateKey("HTTP 401: Unauthorized API key");
              attempts++;
              continue;
            }

            if (res.status === 402 || res.status === 429) {
              ttsKeyManager.markKeyStatus(key, "exhausted");
              ttsKeyManager.rotateKey(`HTTP ${res.status}: Quota/limit reached`);
              attempts++;
              continue;
            }

            throw new Error(`ElevenLabs HTTP ${res.status}`);
          } catch (e: any) {
            if (signal.aborted) return;
            attempts++;
            ttsKeyManager.rotateKey("Fetch failed");
          }
        }

        if (audioBuffer && !signal.aborted) {
          ttsAudioPlayer.enqueueChunkAudio(chunk.index, audioBuffer, chunk.text);
        }
      }
    } catch (err: any) {
      if (!signal.aborted) {
        console.error("[TTSService Direct] Error:", err);
        options.onError?.(err);
      }
    } finally {
      this.isSynthesizing = false;
      this.notifyListeners();
    }
  }

  private handleSessionFinished() {
    this.isSynthesizing = false;
    this.activeText = "";
    this.notifyListeners();
    if (this.currentOptions?.onFinish) {
      this.currentOptions.onFinish();
    }
    this.currentOptions = null;
  }

  /**
   * Stop both conversion and audio playback immediately
   */
  public stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "CANCEL_SYNTHESIS" });
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    ttsAudioPlayer.stop();
    this.isSynthesizing = false;
    this.activeText = "";
    this.currentOptions = null;
    this.notifyListeners();
  }

  /**
   * Pause playback
   */
  public pause(): void {
    ttsAudioPlayer.pause();
    this.notifyListeners();
  }

  /**
   * Resume playback
   */
  public resume(): void {
    ttsAudioPlayer.resume();
    this.notifyListeners();
  }

  public isPlaying(): boolean {
    return ttsAudioPlayer.getPlaybackState().isPlaying || this.isSynthesizing;
  }

  public isPaused(): boolean {
    return ttsAudioPlayer.getPlaybackState().isPaused;
  }

  public getSelectedVoiceId(): string {
    return this.selectedVoiceId;
  }

  public setSelectedVoiceId(voiceId: string): void {
    if (!voiceId) return;
    this.selectedVoiceId = voiceId;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mira_selected_tts_voice_id", voiceId);
      } catch {}
    }
    this.notifyListeners();
  }

  public getAvailableVoices(): TTSVoice[] {
    return ELEVENLABS_VOICES;
  }

  public getState(): TTSState {
    const playState = ttsAudioPlayer.getPlaybackState();
    return {
      isPlaying: playState.isPlaying || this.isSynthesizing,
      isPaused: playState.isPaused,
      currentChunk: playState.currentChunkIndex,
      totalChunks: playState.totalChunks || this.plannedChunks.length,
      activeText: this.activeText,
      currentKeyIndex: ttsKeyManager.getState().currentIndex,
      selectedVoiceId: this.selectedVoiceId,
    };
  }

  public onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {}
    });
  }
}

export const ttsService = new TTSService();
