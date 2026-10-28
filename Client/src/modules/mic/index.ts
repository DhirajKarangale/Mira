/**
 * Dedicated Microphone Module (mic)
 * Captures microphone audio, performs ElevenLabs Speech-to-Text transcription with
 * automatic key rotation, detects configurable wake words ("Mira"),
 * processes sentences and filters greetings/fragments, and routes recognized
 * commands directly into MIRA's chat system.
 */

// Core classes and singletons
export { MicListener, micListener } from "./listener";
export { ElevenLabsSTT, elevenLabsSTT } from "./speechToText";
export { WakeWordDetector, wakeWordDetector, DEFAULT_WAKE_WORDS } from "./wakeWordDetector";
export { SentenceProcessor, sentenceProcessor, DEFAULT_SILENCE_THRESHOLD_MS } from "./sentenceProcessor";
export { ChatRouter, chatRouter } from "./chatRouter";
export { MicManager, micManager } from "./micManager";

// React Hook
export { useMicSync } from "./useMicSync";

// Types
export type {
  MicState,
  MicErrorType,
  MicError,
  AudioCaptureChunk,
  TranscriptionWord,
  TranscriptionResult,
  WakeWordDetectionResult,
  SentenceValidationResult,
  CommandSubmissionResult,
  MicListenerOptions,
  WakeWordOptions,
  SentenceProcessorOptions,
} from "./types";

