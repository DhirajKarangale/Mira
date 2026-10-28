/**
 * Type definitions for the dedicated Microphone (mic) submodule.
 * Covers listener, ElevenLabs speech-to-text, wake word detection,
 * sentence assembly/validation, chat routing, and orchestrator state.
 */

export type MicState =
  | "disabled"
  | "idle"
  | "listening"
  | "collecting_command"
  | "transcribing"
  | "submitting";

export type MicErrorType =
  | "permission_denied"
  | "device_not_found"
  | "not_supported"
  | "network_error"
  | "auth_error"
  | "quota_exhausted"
  | "transcription_error"
  | "engine_error"
  | "unknown";

export interface MicError {
  type: MicErrorType;
  message: string;
  originalError?: unknown;
  timestamp: number;
}

export interface AudioCaptureChunk {
  blob: Blob;
  durationMs: number;
  timestamp: number;
  hasAudioEnergy: boolean;
  peakRms: number;
}

export interface TranscriptionWord {
  text: string;
  start: number;
  end: number;
  speaker_id?: string;
  type?: string;
  logprob?: number;
}

export interface TranscriptionResult {
  text: string;
  languageCode?: string;
  words?: TranscriptionWord[];
  durationMs: number;
  timestamp: number;
}

export interface WakeWordDetectionResult {
  detected: boolean;
  isNewActivation: boolean;
  wakeWord?: string;
  commandPart?: string;
  rawText: string;
}

export interface SentenceValidationResult {
  isValid: boolean;
  command: string;
  rawText: string;
  wordCount: number;
  reason?:
    | "empty"
    | "standalone_greeting"
    | "incomplete_fragment"
    | "non_english"
    | "valid_command";
}

export interface CommandSubmissionResult {
  success: boolean;
  sessionId: string;
  jobId: string;
  isNewSession: boolean;
  command: string;
  error?: string;
}

export interface MicListenerOptions {
  /**
   * Energy threshold (0-100) above which audio is considered active speech.
   * Default: 12.
   */
  energyThreshold?: number;

  /**
   * Timeslice duration for segmenting audio chunks in milliseconds.
   * Default: 2000 (2 seconds).
   */
  chunkIntervalMs?: number;

  /**
   * Silence threshold in milliseconds to signify speech ended.
   * Default: 10000 (10 seconds).
   */
  silenceThresholdMs?: number;
}

export interface WakeWordOptions {
  /**
   * Supported wake words (case-insensitive).
   * Default: ["mira", "myra", "meera", "mera"].
   */
  wakeWords?: string[];
}

export interface SentenceProcessorOptions {
  /**
   * Silence duration in milliseconds indicating the user has finished speaking.
   * Default: 10000 (10 seconds).
   */
  silenceThresholdMs?: number;

  /**
   * Maximum words to consider when screening for incomplete 2-3 word fragments.
   * Default: 3.
   */
  fragmentMaxWords?: number;
}

