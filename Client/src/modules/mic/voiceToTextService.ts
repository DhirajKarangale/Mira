/**
 * VoiceToTextService: Central Voice-to-Text Manager
 *
 * Orchestrates multiple Speech-to-Text providers:
 * - OS Native STT (Local Faster-Whisper on-device Engine port 9007)
 * - ElevenLabs STT (Cloud Scribe API with key rotation)
 * - Browser Web Speech (Real-time streaming SpeechRecognition)
 *
 * Transcribed text from whichever provider is active is forwarded to the central MicManager pipeline.
 * Providers can be added or removed dynamically at runtime.
 */

import {
  IVoiceToTextProvider,
  VoiceToTextResult,
  VoiceToTextCallback,
  ProviderStatus,
  osNativeSTTProvider,
  elevenLabsSTTProvider,
  browserSpeechProvider,
} from "./providers";

export class VoiceToTextService {
  private providers: Map<string, IVoiceToTextProvider> = new Map();
  private activeProviderId: string = "browser_speech";
  private onTextListeners: Set<VoiceToTextCallback> = new Set();
  private isRunning = false;

  constructor() {
    // Register built-in providers from separate provider scripts
    this.registerProvider(browserSpeechProvider);
    this.registerProvider(osNativeSTTProvider);
    this.registerProvider(elevenLabsSTTProvider);

    // If browser speech is not supported, default to OS native STT
    if (!browserSpeechProvider.isSupported()) {
      this.activeProviderId = osNativeSTTProvider.id;
    }
  }

  /**
   * Registers a new STT provider script into the service.
   * Enables adding any microphone service in the future without changing core logic.
   */
  public registerProvider(provider: IVoiceToTextProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[VoiceToTextService] Registered provider: "${provider.name}" (${provider.id})`);
  }

  /**
   * Unregisters / removes a provider by its identifier.
   */
  public unregisterProvider(providerId: string): void {
    if (this.activeProviderId === providerId && this.isRunning) {
      this.stop();
    }
    this.providers.delete(providerId);
    console.log(`[VoiceToTextService] Unregistered provider: ${providerId}`);
  }

  /**
   * Retrieves a specific provider by its ID.
   */
  public getProvider(providerId: string): IVoiceToTextProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Returns a list of all registered providers with their support status.
   */
  public getAllProviders(): ProviderStatus[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isSupported: p.isSupported(),
      isRunning: p.getIsRunning ? p.getIsRunning() : false,
    }));
  }

  /**
   * Returns all providers supported in the current runtime environment.
   */
  public getSupportedProviders(): IVoiceToTextProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.isSupported());
  }

  public getActiveProvider(): IVoiceToTextProvider | null {
    return this.providers.get(this.activeProviderId) || null;
  }

  public getActiveProviderId(): string {
    return this.activeProviderId;
  }

  /**
   * Sets the active provider (e.g., 'browser_speech', 'os_native_stt', 'elevenlabs_stt').
   */
  public setActiveProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      console.warn(`[VoiceToTextService] Cannot activate unknown provider ID: "${providerId}"`);
      return;
    }
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.stop();
    }
    this.activeProviderId = providerId;
    if (wasRunning) {
      this.start().catch((err) => {
        console.error("[VoiceToTextService] Failed to start after switching provider:", err);
      });
    }
  }

  /**
   * Adds a subscriber to receive transcribed text from ANY active provider.
   */
  public onText(callback: VoiceToTextCallback): () => void {
    this.onTextListeners.add(callback);
    return () => {
      this.onTextListeners.delete(callback);
    };
  }

  /**
   * Dispatches transcribed text to all listeners (MicManager).
   */
  public broadcastText(result: VoiceToTextResult): void {
    if (!result || !result.text) return;
    this.onTextListeners.forEach((fn) => {
      try {
        fn(result);
      } catch (err) {
        console.debug("[VoiceToTextService] Listener error:", err);
      }
    });
  }

  /**
   * Starts the active Voice-to-Text provider.
   * Also ensures the OS Native event stream is connected so OS-level events are caught.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    let provider = this.getActiveProvider();
    if (!provider || !provider.isSupported()) {
      const available = this.getSupportedProviders();
      if (available.length > 0) {
        provider = available[0];
        this.activeProviderId = provider.id;
      }
    }

    if (!provider) {
      throw new Error("No supported Voice-to-Text provider is currently available.");
    }

    this.isRunning = true;
    console.log(`[VoiceToTextService] Starting provider: "${provider.name}"`);

    const handleText = (result: VoiceToTextResult) => {
      this.broadcastText(result);
    };

    const handleError = (error: Error) => {
      console.warn(`[VoiceToTextService] Provider error (${provider?.id}):`, error.message);
    };

    try {
      await provider.start(handleText, handleError);
    } catch (startErr) {
      console.warn(`[VoiceToTextService] Primary provider failed to start, falling back:`, startErr);
      // Fallback to next available provider if primary fails
      const fallback = this.getSupportedProviders().find((p) => p.id !== provider?.id);
      if (fallback) {
        this.activeProviderId = fallback.id;
        await fallback.start(handleText, handleError);
      } else {
        this.isRunning = false;
        throw startErr;
      }
    }

    // If browser speech is primary, also run OS Native STT in background for event listening
    if (this.activeProviderId === browserSpeechProvider.id && osNativeSTTProvider.isSupported()) {
      try {
        osNativeSTTProvider.start(handleText, handleError);
      } catch {}
    }
  }

  /**
   * Stops all active Voice-to-Text providers safely.
   */
  public stop(): void {
    this.isRunning = false;
    for (const provider of this.providers.values()) {
      try {
        provider.stop();
      } catch (e) {
        console.debug(`[VoiceToTextService] Error stopping provider ${provider.id}:`, e);
      }
    }
    console.log("[VoiceToTextService] All providers stopped.");
  }

  /**
   * Transcribes an audio Blob using the best available STT provider:
   * 1. OS Native Neural STT (Faster-Whisper on Engine port 9007 - 100% offline, 0 quota)
   * 2. ElevenLabs Scribe STT (Cloud fallback with multi-key rotation)
   */
  public async transcribeAudioBlob(audioBlob: Blob): Promise<VoiceToTextResult> {
    if (!audioBlob || audioBlob.size === 0) {
      return {
        text: "",
        isFinal: true,
        provider: "none",
        language: "en",
      };
    }

    // 1. Primary: Local On-Device Neural STT (Faster-Whisper)
    try {
      const localResult = await osNativeSTTProvider.transcribeBlob(audioBlob);
      if (localResult.text) {
        return localResult;
      }
    } catch (localErr) {
      console.debug("[VoiceToTextService] Local STT unavailable, trying ElevenLabs fallback:", localErr);
    }

    // 2. Fallback: ElevenLabs STT with round-robin key rotation
    if (elevenLabsSTTProvider.isSupported()) {
      try {
        return await elevenLabsSTTProvider.transcribeBlob(audioBlob);
      } catch (cloudErr) {
        console.warn("[VoiceToTextService] ElevenLabs STT fallback error:", cloudErr);
        throw cloudErr;
      }
    }

    throw new Error("No speech-to-text service is currently reachable to transcribe audio.");
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const voiceToTextService = new VoiceToTextService();

// Re-export providers and types for convenience
export * from "./providers";
