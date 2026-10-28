/**
 * Browser Speech-to-Text Provider (Web Speech API)
 *
 * Provides real-time, zero-latency streaming speech recognition via the browser's
 * native SpeechRecognition / webkitSpeechRecognition API (Chrome, Edge, Brave, Safari).
 * - Real-time interim & final transcription.
 * - Multi-alternative homophone extraction for wake word ("Mira") and interrupt commands ("stop", "mute").
 * - Strictly English language ("en-US").
 * - Clean lifecycle management with safe stop and error handling.
 */

import type {
  IVoiceToTextProvider,
  VoiceToTextResult,
  VoiceToTextCallback,
  VoiceToTextErrorCallback,
} from "./types";
import { audioPlayer } from "@/modules/voice/audioPlayer";

export class BrowserSpeechProvider implements IVoiceToTextProvider {
  public readonly id = "browser_speech";
  public readonly name = "Browser Web Speech (Real-time Streaming)";
  public readonly description =
    "Native zero-latency streaming SpeechRecognition built into Chrome, Edge, Brave, and Safari.";

  private recognition: any = null;
  private isRunning = false;
  private onTextCallback: VoiceToTextCallback | null = null;
  private onErrorCallback: VoiceToTextErrorCallback | null = null;

  public isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
    );
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Starts real-time streaming SpeechRecognition.
   */
  public async start(
    onText: VoiceToTextCallback,
    onError?: VoiceToTextErrorCallback
  ): Promise<void> {
    if (this.isRunning) return;

    if (!this.isSupported()) {
      throw new Error("Browser Web Speech API is not supported in this browser.");
    }

    const SpeechRecClass =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    this.onTextCallback = onText;
    this.onErrorCallback = onError || null;
    this.isRunning = true;

    try {
      this.recognition = new SpeechRecClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      // Strictly English
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        console.log(`[BrowserSpeechProvider] Real-time recognition started (lang: en-US).`);
      };

      this.recognition.onspeechstart = () => {
        if (audioPlayer.isPlaying) {
          audioPlayer.duckVolume(0.15);
        }
      };

      this.recognition.onsoundstart = () => {
        if (audioPlayer.isPlaying) {
          audioPlayer.duckVolume(0.15);
        }
      };

      this.recognition.onresult = (event: any) => {
        if (!this.isRunning) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res) continue;

          const alternatives: string[] = [];
          for (let a = 0; a < res.length; a++) {
            if (res[a]?.transcript) {
              alternatives.push(res[a].transcript.trim());
            }
          }

          const primary = alternatives[0] || "";
          if (!primary) continue;

          const result: VoiceToTextResult = {
            text: primary,
            isFinal: Boolean(res.isFinal),
            provider: this.id,
            language: "en-US", // Strictly English
            alternatives,
            confidence: res[0]?.confidence,
          };

          this.onTextCallback?.(result);
        }
      };

      this.recognition.onerror = (e: any) => {
        if (!this.isRunning) return;

        const errType = e?.error;
        if (errType === "no-speech") {
          // Normal during silence; silently wait for next speech
          return;
        }

        console.debug(`[BrowserSpeechProvider] Recognition event notice: ${errType}`);

        if (errType === "not-allowed" || errType === "permission-denied") {
          const err = new Error("Microphone permission denied in browser settings.");
          this.onErrorCallback?.(err);
          this.stop();
        }
      };

      this.recognition.onend = () => {
        // Automatically keep active while in running state
        if (this.isRunning && this.recognition) {
          try {
            this.recognition.start();
          } catch {}
        }
      };

      this.recognition.start();
    } catch (err: unknown) {
      this.isRunning = false;
      const error = err instanceof Error ? err : new Error(String(err));
      this.onErrorCallback?.(error);
      throw error;
    }
  }

  /**
   * Safely stops browser speech recognition and cleans up handlers.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.onstart = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.onTextCallback = null;
    this.onErrorCallback = null;
    console.log(`[BrowserSpeechProvider] Stopped.`);
  }
}

export const browserSpeechProvider = new BrowserSpeechProvider();

