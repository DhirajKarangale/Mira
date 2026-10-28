/**
 * Speech-to-Text Providers Module
 *
 * Exports individual STT providers as dedicated, isolated scripts:
 * - OS Native STT: Local Faster-Whisper on-device neural transcription (port 9007).
 * - ElevenLabs STT: Cloud Scribe STT API with round-robin key rotation.
 * - Browser Web Speech: Zero-latency streaming SpeechRecognition.
 *
 * Allows adding or removing STT providers easily in the future.
 */

export * from "./types";
export * from "./osNativeSTTProvider";
export * from "./elevenLabsSTTProvider";
export * from "./browserSpeechProvider";

import { osNativeSTTProvider } from "./osNativeSTTProvider";
import { elevenLabsSTTProvider } from "./elevenLabsSTTProvider";
import { browserSpeechProvider } from "./browserSpeechProvider";
import type { IVoiceToTextProvider } from "./types";

/**
 * Default registry of all available STT providers.
 */
export const DEFAULT_STT_PROVIDERS: IVoiceToTextProvider[] = [
  browserSpeechProvider,
  osNativeSTTProvider,
  elevenLabsSTTProvider,
];

