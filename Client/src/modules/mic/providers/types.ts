/**
 * Unified Type Definitions for Speech-to-Text (STT) Providers.
 * Each speech service (OS Native Whisper, ElevenLabs, Browser Speech, etc.)
 * adheres to these common interfaces, ensuring complete modularity.
 */

export interface VoiceToTextWord {
  word: string;
  start?: number;
  end?: number;
  confidence?: number;
}

export interface VoiceToTextResult {
  text: string;
  isFinal: boolean;
  provider: string;
  confidence?: number;
  language?: string; // Strictly English ("en" or "en-US")
  alternatives?: string[];
  durationMs?: number;
  words?: VoiceToTextWord[];
}

export type VoiceToTextCallback = (result: VoiceToTextResult) => void;
export type VoiceToTextErrorCallback = (error: Error) => void;

export interface ProviderStatus {
  id: string;
  name: string;
  isSupported: boolean;
  isRunning: boolean;
  isAvailable?: boolean;
}

export interface IVoiceToTextProvider {
  /**
   * Unique identifier for this provider (e.g., 'os_native_stt', 'elevenlabs_stt', 'browser_speech').
   */
  readonly id: string;

  /**
   * Human-readable name.
   */
  readonly name: string;

  /**
   * Short description of how and where transcription occurs.
   */
  readonly description: string;

  /**
   * Checks whether this provider is supported in the current environment.
   */
  isSupported(): boolean;

  /**
   * Starts listening / streaming transcription.
   */
  start(onText: VoiceToTextCallback, onError?: VoiceToTextErrorCallback): Promise<void> | void;

  /**
   * Stops listening / streaming transcription.
   */
  stop(): Promise<void> | void;

  /**
   * Optional: Transcribes a pre-recorded audio Blob (for chunk-based STT).
   */
  transcribeBlob?(audioBlob: Blob): Promise<VoiceToTextResult>;

  /**
   * Checks whether this provider is currently actively recording or listening.
   */
  getIsRunning?(): boolean;
}

