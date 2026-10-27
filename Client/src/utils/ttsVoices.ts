/**
 * ElevenLabs Curated Voice Library & Model Presets
 *
 * Includes the requested community models:
 * 1. Tara (Be3X8pg7kLN4vyyMC3QN) - https://elevenlabs.io/voices/Be3X8pg7kLN4vyyMC3QN
 * 2. Aisha (m7GHBtY0UEqljrKQw2JH) - https://elevenlabs.io/voices/m7GHBtY0UEqljrKQw2JH
 * Plus verified premade fallbacks for free and paid tiers.
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

export const ELEVENLABS_VOICES: TTSVoice[] = [
  {
    id: "Be3X8pg7kLN4vyyMC3QN",
    name: "Tara",
    description: "Soft, expressive & cinematic advertising voice (Hindi / English)",
    gender: "female",
    category: "library",
    url: "https://elevenlabs.io/voices/Be3X8pg7kLN4vyyMC3QN",
    badge: "Requested",
  },
  {
    id: "m7GHBtY0UEqljrKQw2JH",
    name: "Aisha",
    description: "Warm, playful, affectionate & conversational partner voice",
    gender: "female",
    category: "library",
    url: "https://elevenlabs.io/voices/m7GHBtY0UEqljrKQw2JH",
    badge: "Requested",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    description: "Mature, reassuring & confident (Standard Premade)",
    gender: "female",
    category: "premade",
    badge: "Premade Default",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Deep, firm & confident (Standard Premade)",
    gender: "male",
    category: "premade",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    description: "Clear, engaging educator (Standard Premade)",
    gender: "female",
    category: "premade",
  },
];

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (Verified Premade - Available on free & paid tiers)
export const FALLBACK_PREMADE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
