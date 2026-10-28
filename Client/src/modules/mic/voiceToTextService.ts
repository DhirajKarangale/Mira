/**
 * VoiceToTextService: Standalone Voice-to-Text Provider Architecture.
 * Converts microphone audio into text and forwards the text output to the central MicManager pipeline.
 *
 * Pluggable architecture:
 * In the future, any microphone service (Local Neural Whisper, Browser Speech, ElevenLabs, OS SAPI, Vosk, etc.)
 * can be added, enabled, or removed without touching the core wake word or chat routing logic.
 */

export interface VoiceToTextResult {
  text: string;
  isFinal: boolean;
  provider: string;
  confidence?: number;
  language?: string;
  alternatives?: string[];
}

export type VoiceToTextCallback = (result: VoiceToTextResult) => void;
export type VoiceToTextErrorCallback = (error: Error) => void;

export interface IVoiceToTextProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  isSupported(): boolean;
  start(onText: VoiceToTextCallback, onError?: VoiceToTextErrorCallback): Promise<void>;
  stop(): Promise<void> | void;
}

/**
 * Provider 1: Browser SpeechRecognition Engine
 * Zero-latency native streaming recognition with multi-alternative homophone detection.
 */
export class BrowserSpeechRecognitionProvider implements IVoiceToTextProvider {
  public readonly id = "browser_speech_recognition";
  public readonly name = "Browser Web Speech (Real-time Streaming)";
  public readonly description = "Native zero-latency streaming SpeechRecognition built into Chrome, Edge, and Brave.";

  private recognition: any = null;
  private isActive = false;
  private onTextCallback: VoiceToTextCallback | null = null;
  private onErrorCallback: VoiceToTextErrorCallback | null = null;

  public isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
    );
  }

  public async start(onText: VoiceToTextCallback, onError?: VoiceToTextErrorCallback): Promise<void> {
    if (this.isActive) return;

    const SpeechRecClass =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecClass) {
      throw new Error("Browser SpeechRecognition is not supported in this environment.");
    }

    this.onTextCallback = onText;
    this.onErrorCallback = onError || null;

    try {
      this.recognition = new SpeechRecClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isActive = true;
        console.log(`[VoiceToText] ${this.name} started successfully.`);
      };

      this.recognition.onresult = (event: any) => {
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

          this.onTextCallback?.({
            text: primary,
            isFinal: Boolean(res.isFinal),
            provider: this.id,
            alternatives,
            language: "en-US",
          });
        }
      };

      this.recognition.onerror = (e: any) => {
        if (e?.error === "no-speech") return;
        console.debug(`[VoiceToText] ${this.name} error event:`, e?.error);
        if (e?.error === "not-allowed" || e?.error === "permission-denied") {
          this.onErrorCallback?.(new Error("Microphone permission denied in browser settings."));
        }
      };

      this.recognition.onend = () => {
        // Automatically keep active while in running state
        if (this.isActive) {
          try {
            this.recognition?.start();
          } catch {}
        }
      };

      this.recognition.start();
      this.isActive = true;
    } catch (err: unknown) {
      this.isActive = false;
      const error = err instanceof Error ? err : new Error(String(err));
      this.onErrorCallback?.(error);
      throw error;
    }
  }

  public stop(): void {
    this.isActive = false;
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.onTextCallback = null;
    this.onErrorCallback = null;
  }
}

/**
 * Provider 2: Local On-Device Neural STT (Faster-Whisper on Engine)
 * Transcribes recorded audio blobs locally on port 9007 with 0 external API calls and 0 quota.
 */
export class LocalWhisperSTTProvider implements IVoiceToTextProvider {
  public readonly id = "local_whisper";
  public readonly name = "Local Neural STT (Faster-Whisper)";
  public readonly description = "100% on-device neural transcription running on MIRA Engine (port 9007) with zero API keys.";

  public static readonly ENDPOINT = "http://127.0.0.1:9007/voice/stt/transcribe";

  public isSupported(): boolean {
    return true;
  }

  public async start(_onText: VoiceToTextCallback, _onError?: VoiceToTextErrorCallback): Promise<void> {
    // Media recorder chunks are piped through transcribeBlob
    console.log(`[VoiceToText] ${this.name} initialized for blob transcription.`);
  }

  public async transcribeBlob(audioBlob: Blob): Promise<VoiceToTextResult> {
    const formData = new FormData();
    const ext = audioBlob.type.includes("webm")
      ? "webm"
      : audioBlob.type.includes("mp4")
      ? "mp4"
      : audioBlob.type.includes("ogg")
      ? "ogg"
      : "wav";
    formData.append("file", audioBlob, `audio.${ext}`);

    const res = await fetch(LocalWhisperSTTProvider.ENDPOINT, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Local STT HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const text = (data.text || "")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      text,
      isFinal: true,
      provider: this.id,
      language: data.language || "en",
    };
  }

  public stop(): void {}
}

/**
 * Master Registry: VoiceToTextService
 * Decouples speech recognition providers from the central command processor.
 */
export class VoiceToTextService {
  private providers: Map<string, IVoiceToTextProvider> = new Map();
  private activeProviderId: string = "browser_speech_recognition";
  private onTextListeners: Set<VoiceToTextCallback> = new Set();
  private isRunning = false;

  constructor() {
    // Register built-in providers
    this.registerProvider(new BrowserSpeechRecognitionProvider());
    this.registerProvider(new LocalWhisperSTTProvider());
  }

  /**
   * Registers a new microphone/STT provider (allows adding new mic services at any time).
   */
  public registerProvider(provider: IVoiceToTextProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[VoiceToTextService] Registered STT provider: "${provider.name}" (${provider.id})`);
  }

  /**
   * Removes a microphone/STT provider by ID.
   */
  public unregisterProvider(providerId: string): void {
    if (this.activeProviderId === providerId && this.isRunning) {
      this.stop();
    }
    this.providers.delete(providerId);
  }

  public getAvailableProviders(): IVoiceToTextProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.isSupported());
  }

  public getActiveProvider(): IVoiceToTextProvider | null {
    return this.providers.get(this.activeProviderId) || null;
  }

  public setActiveProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      console.warn(`[VoiceToTextService] Unknown provider ID: "${providerId}"`);
      return;
    }
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.stop();
    }
    this.activeProviderId = providerId;
    if (wasRunning) {
      this.start().catch((err) => {
        console.error("[VoiceToTextService] Failed to restart with new provider:", err);
      });
    }
  }

  /**
   * Adds a listener for transcribed text output.
   * Forwarded to the central command processor.
   */
  public onText(callback: VoiceToTextCallback): () => void {
    this.onTextListeners.add(callback);
    return () => {
      this.onTextListeners.delete(callback);
    };
  }

  /**
   * Starts the active Voice-to-Text provider.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    let provider = this.getActiveProvider();
    if (!provider || !provider.isSupported()) {
      // Fallback to first supported provider
      const available = this.getAvailableProviders();
      if (available.length > 0) {
        provider = available[0];
        this.activeProviderId = provider.id;
      }
    }

    if (!provider) {
      throw new Error("No supported Voice-to-Text provider available.");
    }

    this.isRunning = true;
    console.log(`[VoiceToTextService] Starting active provider: "${provider.name}"`);

    await provider.start(
      (result: VoiceToTextResult) => {
        // Forward text output to all registered listeners (e.g. MicManager)
        this.onTextListeners.forEach((fn) => {
          try {
            fn(result);
          } catch (e) {
            console.debug("[VoiceToTextService] Listener error:", e);
          }
        });
      },
      (error: Error) => {
        console.error(`[VoiceToTextService] Error in provider "${provider?.name}":`, error);
      }
    );
  }

  /**
   * Stops the active Voice-to-Text provider.
   */
  public stop(): void {
    this.isRunning = false;
    const provider = this.getActiveProvider();
    if (provider) {
      try {
        provider.stop();
      } catch (e) {
        console.debug("[VoiceToTextService] Error stopping provider:", e);
      }
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const voiceToTextService = new VoiceToTextService();
