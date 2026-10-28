/**
 * Voice Submodule Types
 */

export type ResponseState =
  | "queued"
  | "generating"
  | "playing"
  | "completed"
  | "cancelled"
  | "failed";

export type ChunkState =
  | "pending"
  | "generating"
  | "ready"
  | "playing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TextChunk {
  id: string;
  responseId: string;
  orderIndex: number;
  text: string;
}

export interface QueuedChunk extends TextChunk {
  state: ChunkState;
  audioBlob?: Blob;
  audioUrl?: string;
  error?: string;
}

export interface QueuedVoiceResponse {
  id: string;
  originalText: string;
  cleanText: string;
  chunks: QueuedChunk[];
  state: ResponseState;
  currentChunkIndex: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  hasNotifiedError?: boolean;
}

export interface VoiceQueueSnapshot {
  currentResponse: QueuedVoiceResponse | null;
  pendingResponses: QueuedVoiceResponse[];
  interResponseDelayMs: number;
  isPaused: boolean;
  totalInQueue: number;
}

export interface KeyRotationCheckResult {
  shouldRotate: boolean;
  reason?: string;
}

export interface ChunkGenerationOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  useSpeakerBoost?: boolean;
}

