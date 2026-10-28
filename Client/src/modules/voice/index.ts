/**
 * Dedicated Voice & Microphone Submodule
 * Manages microphone capture, wake-word controls, ElevenLabs text-to-speech,
 * automatic API key rotation, sentence chunking, IndexedDB local audio caching,
 * and a centralized queued playback manager with route/chat integration.
 */

import { voiceQueueManager } from "./voiceQueueManager";

/**
 * High-level function that accepts text of any reasonable length
 * and manages the complete text-to-speech pipeline.
 */
export async function speakText(
  text: string,
  customId?: string
): Promise<string | null> {
  return await voiceQueueManager.submitResponse(text, customId);
}

// Module exports
export { canPlayVoice, isChatsRoute } from "./eligibility";
export { cleanTextForSpeech, chunkText } from "./textProcessor";
export { audioStorage } from "./audioStorage";
export {
  generateChunkAudio,
  isKeyRotationError,
} from "./elevenlabsClient";
export {
  keyQuotaManager,
  ttsKeyManager,
  KeyQuotaManager,
  type KeyQuotaInfo,
  type SubscriptionCheckResult,
} from "./keyQuotaManager";
export { audioPlayer, AudioPlayer } from "./audioPlayer";
export { voiceQueueManager } from "./voiceQueueManager";
export { chatVoiceBridge } from "./chatVoiceBridge";
export { useVoiceQueue } from "./useVoiceQueue";
export { VoicePlaybackOverlay } from "./VoicePlaybackOverlay";

// Store & service exports
export { voiceService, type VoiceSnapshot } from "@/services/voice.service";
export { useVoiceStore, type VoiceState } from "@/store/useVoiceStore";
export { useVoiceSync } from "@/hooks/useVoiceSync";

// Types
export type {
  ResponseState,
  ChunkState,
  TextChunk,
  QueuedChunk,
  QueuedVoiceResponse,
  VoiceQueueSnapshot,
  KeyRotationCheckResult,
  ChunkGenerationOptions,
} from "./types";
export type {
  VoiceKeysResponse,
  VoiceCurrentKeyUpdateRequest,
  VoiceConfig,
  VoiceConfigUpdateRequest,
  VoiceModel,
  VoiceModelUpdateRequest,
} from "@/services/vault.service";
