/**
 * ElevenLabs Voice Configuration
 *
 * Configured with a single verified voice model:
 * Sarah (EXAVITQu4vr4xnSDxMaL) - Mature, reassuring & confident standard premade model
 * supported across both free and paid tier ElevenLabs API keys.
 */

export interface TTSVoice {
  id: string;
  name: string;
  description: string;
  gender: "female" | "male" | "neutral";
  category: "library" | "premade";
  url?: string;
  badge?: string;
}

export const SINGLE_VOICE_MODEL: TTSVoice = {
  id: "EXAVITQu4vr4xnSDxMaL",
  name: "Sarah",
  description: "Mature, reassuring & confident (Standard Premade)",
  gender: "female",
  category: "premade",
  badge: "Active Voice Model",
};

export const ELEVENLABS_VOICES: TTSVoice[] = [SINGLE_VOICE_MODEL];

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
export const FALLBACK_PREMADE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
