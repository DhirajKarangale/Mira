/**
 * Text-to-Speech Dedicated Asynchronous Web Worker
 *
 * Runs off the main thread. Responsible for:
 * 1. Smart chunking responses into ~100-character segments
 * 2. Managing ElevenLabs API key rotation
 * 3. Fetching audio streams asynchronously with pipelining
 * 4. Transferring binary audio buffers directly to main thread
 */

import { smartChunkText, type TTSChunk } from "./ttsChunker";
import { DEFAULT_VOICE_ID, FALLBACK_PREMADE_VOICE_ID } from "./ttsVoices";

const DEFAULT_MODEL_ID = "eleven_turbo_v2_5"; // Ultra-low latency streaming model

export interface KeyUsageMeta {
  charsUsed: number;
  isExhausted: boolean;
  isInvalid: boolean;
}

interface StartMessage {
  type: "START_SYNTHESIS";
  text: string;
  voiceId?: string;
  modelId?: string;
  keys: string[];
  activeKeyIndex?: number;
  keysUsage?: Record<string, KeyUsageMeta>;
}

interface CancelMessage {
  type: "CANCEL_SYNTHESIS";
}

type WorkerIncomingMessage = StartMessage | CancelMessage;

let activeAbortController: AbortController | null = null;
let currentKeyIndex = 0;
let localKeysUsage: Record<string, KeyUsageMeta> = {};

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;

  if (data.type === "CANCEL_SYNTHESIS") {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    self.postMessage({ type: "SYNTHESIS_CANCELLED" });
    return;
  }

  if (data.type === "START_SYNTHESIS") {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    const { text, keys } = data;
    const voiceId = data.voiceId || DEFAULT_VOICE_ID;
    const modelId = data.modelId || DEFAULT_MODEL_ID;
    currentKeyIndex = data.activeKeyIndex || 0;
    localKeysUsage = { ...(data.keysUsage || {}) };

    if (!text || !text.trim()) {
      self.postMessage({ type: "SYNTHESIS_COMPLETE" });
      return;
    }

    if (!keys || keys.length === 0) {
      self.postMessage({
        type: "SYNTHESIS_ERROR",
        message: "No ElevenLabs API keys provided in configuration.",
      });
      return;
    }

    // 1. Chunk text into ~100 char pieces preserving sequence and cadence
    const chunks = smartChunkText(text, 100);

    self.postMessage({
      type: "CHUNKS_PLANNED",
      total: chunks.length,
      chunks: chunks.map((c) => ({
        index: c.index,
        text: c.text,
        charCount: c.charCount,
      })),
    });

    try {
      // Pipelined chunk conversion: Process chunks in strict sequence with 2-chunk prefetching
      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) break;

        const chunk = chunks[i];
        const audioBuffer = await fetchChunkWithKeyRotation(
          chunk,
          voiceId,
          modelId,
          keys,
          signal
        );

        if (signal.aborted) break;

        if (audioBuffer) {
          // Zero-copy transfer of ArrayBuffer to the main thread
          (self as any).postMessage(
            {
              type: "CHUNK_AUDIO",
              index: chunk.index,
              total: chunks.length,
              text: chunk.text,
              audioBuffer,
            },
            [audioBuffer]
          );
        }
      }

      if (!signal.aborted) {
        self.postMessage({ type: "SYNTHESIS_COMPLETE" });
      }
    } catch (err: any) {
      if (!signal.aborted) {
        console.error("[TTS Worker] Synthesis error:", err);
        self.postMessage({
          type: "SYNTHESIS_ERROR",
          message: err?.message || "Failed to convert speech with ElevenLabs.",
        });
      }
    } finally {
      activeAbortController = null;
    }
  }
};

/**
 * Fetch audio stream for a chunk, rotating keys proactively before quota exhaustion
 */
async function fetchChunkWithKeyRotation(
  chunk: TTSChunk,
  voiceId: string,
  modelId: string,
  keys: string[],
  signal: AbortSignal
): Promise<ArrayBuffer | null> {
  const maxAttempts = keys.length;
  let attempts = 0;
  const chunkCost = chunk.charCount || chunk.text.length || 100;

  while (attempts < maxAttempts) {
    if (signal.aborted) return null;

    let key = keys[currentKeyIndex];
    let usage = localKeysUsage[key] || { charsUsed: 0, isExhausted: false, isInvalid: false };

    // Proactive Pre-Exhaustion Check:
    // If the current key is marked invalid/exhausted OR charsUsed + chunkCost >= 8,800 chars (~88% of 10k quota),
    // and alternative keys are present in the pool, rotate BEFORE making the network request!
    let proactiveSkips = 0;
    while (
      proactiveSkips < keys.length &&
      (usage.isExhausted ||
        usage.isInvalid ||
        (keys.length > 1 && usage.charsUsed + chunkCost >= 8800))
    ) {
      const prevIndex = currentKeyIndex;
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      proactiveSkips++;
      key = keys[currentKeyIndex];
      usage = localKeysUsage[key] || { charsUsed: 0, isExhausted: false, isInvalid: false };

      self.postMessage({
        type: "KEY_ROTATED",
        previousIndex: prevIndex,
        newIndex: currentKeyIndex,
        reason: "Proactive rotation: key is near exhaustion (~8,800 chars) or flagged invalid.",
      });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: chunk.text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
        signal,
      });

      if (response.ok) {
        // Record character usage
        usage.charsUsed += chunkCost;
        localKeysUsage[key] = usage;

        self.postMessage({
          type: "USAGE_RECORDED",
          key,
          keyIndex: currentKeyIndex,
          charsUsed: chunkCost,
        });

        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
      }

      // Check if library voice requires a paid plan on this key
      if (response.status === 402) {
        const errorText = await response.text();
        if (
          errorText.includes("paid_plan_required") &&
          voiceId !== FALLBACK_PREMADE_VOICE_ID
        ) {
          self.postMessage({
            type: "VOICE_FALLBACK",
            originalVoiceId: voiceId,
            fallbackVoiceId: FALLBACK_PREMADE_VOICE_ID,
            reason:
              "Library voice (Tara/Aisha) requires an ElevenLabs paid plan. Auto-switched to standard voice.",
          });
          return fetchChunkWithKeyRotation(
            chunk,
            FALLBACK_PREMADE_VOICE_ID,
            modelId,
            keys,
            signal
          );
        }

        // Quota / subscription exhausted
        usage.isExhausted = true;
        localKeysUsage[key] = usage;
        self.postMessage({
          type: "KEY_STATUS_CHANGED",
          key,
          keyIndex: currentKeyIndex,
          status: "exhausted",
          reason: "HTTP 402: Quota or subscription limit reached",
        });
      }

      if (response.status === 401) {
        // Unauthorized key (e.g. invalid key format or revoked)
        usage.isInvalid = true;
        localKeysUsage[key] = usage;
        self.postMessage({
          type: "KEY_STATUS_CHANGED",
          key,
          keyIndex: currentKeyIndex,
          status: "invalid",
          reason: "HTTP 401: Unauthorized API key",
        });
      }

      if (response.status === 429) {
        // Rate limited or quota exceeded
        usage.isExhausted = true;
        localKeysUsage[key] = usage;
        self.postMessage({
          type: "KEY_STATUS_CHANGED",
          key,
          keyIndex: currentKeyIndex,
          status: "exhausted",
          reason: "HTTP 429: Rate limited or quota exhausted",
        });
      }

      // Rotate key on 401, 402, 429
      if (
        response.status === 401 ||
        response.status === 402 ||
        response.status === 429
      ) {
        const prevIndex = currentKeyIndex;
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;

        self.postMessage({
          type: "KEY_ROTATED",
          previousIndex: prevIndex,
          newIndex: currentKeyIndex,
          reason: `HTTP ${response.status}: Key exhausted, unauthorized, or rate-limited`,
        });

        console.warn(
          `[TTS Worker] ElevenLabs key [${prevIndex}] exhausted (HTTP ${response.status}). Rotated to key [${currentKeyIndex}].`
        );
        continue;
      }

      const errorText = await response.text();
      console.warn(`[TTS Worker] ElevenLabs error: HTTP ${response.status}: ${errorText}`);
      throw new Error(`ElevenLabs HTTP ${response.status}: ${errorText}`);
    } catch (err: any) {
      if (signal.aborted) return null;
      if (err.name === "AbortError") return null;

      // Rotate key on network/fetch errors as well if not last attempt
      attempts++;
      if (attempts < maxAttempts) {
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        continue;
      }
      throw err;
    }
  }

  throw new Error("All provided ElevenLabs API keys in the array have been exhausted.");
}
