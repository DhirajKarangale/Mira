import { useVoiceStore } from "@/store/useVoiceStore";
import { keyQuotaManager } from "./keyQuotaManager";
import type { KeyRotationCheckResult, ChunkGenerationOptions } from "./types";

export interface PremadeVoice {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: string;
  description: string;
  recommended?: boolean;
}

export interface VoiceModelOption {
  id: string;
  name: string;
  description: string;
  tag: string;
  recommended?: boolean;
}

// Strictly 3 verified Free Premade Female Voices on ElevenLabs:
export const PREMADE_VOICES: PremadeVoice[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    accent: "American",
    description: "Calm, articulate, warm & conversational (Iconic AI Assistant)",
    recommended: true,
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    gender: "female",
    accent: "American",
    description: "Mature, reassuring & friendly companion tone",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    gender: "female",
    accent: "British",
    description: "Clear, confident & engaging educator tone",
  },
];

// Available ElevenLabs Models
export const AVAILABLE_MODELS: VoiceModelOption[] = [
  {
    id: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    description: "Ultra-low latency (~75ms), crystal-clear speech, 50% lower credit usage (Recommended)",
    tag: "Fastest & Recommended",
    recommended: true,
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Eleven Turbo v2.5",
    description: "High quality, low latency, ideal for real-time conversation",
    tag: "Low Latency",
  },
  {
    id: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    description: "Expressive emotional depth across 29+ languages",
    tag: "Rich & Expressive",
  },
];

export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel (Iconic premade female voice)
export const DEFAULT_MODEL_ID = "eleven_flash_v2_5"; // Ultra-low latency conversational model

/**
 * Reusable error-detection function that identifies:
 * - Authentication errors (HTTP 401)
 * - Expired, invalid, or blocked API keys
 * - Exhausted quotas and usage-limit errors (HTTP 429, 402)
 *
 * Returns `shouldRotate: false` for unrelated errors (network failures, malformed requests, invalid text,
 * or voice library restrictions that require a paid plan rather than a new key).
 */
export function isKeyRotationError(
  statusCode: number,
  errorData?: unknown
): KeyRotationCheckResult {
  // 1. Authentication or forbidden failure (invalid, revoked, expired, or forbidden key)
  if (statusCode === 401 || statusCode === 403) {
    return {
      shouldRotate: true,
      reason: `Authentication or access error (HTTP ${statusCode}): invalid, missing, expired, or blocked API key`,
    };
  }

  // 2. Quota exhaustion / payment required for account credits or plan tier
  if (statusCode === 402) {
    return {
      shouldRotate: true,
      reason: "Usage quota exhausted / payment required (HTTP 402)",
    };
  }

  // 3. Rate limiting / concurrency or monthly quota exceeded
  if (statusCode === 429) {
    return {
      shouldRotate: true,
      reason: "Rate limit / quota exceeded (HTTP 429)",
    };
  }

  // 4. Inspect detailed error messages inside response payload if available
  if (errorData) {
    const errorStr = (
      typeof errorData === "string" ? errorData : JSON.stringify(errorData)
    ).toLowerCase();

    const quotaKeywords = [
      "quota_exceeded",
      "quota exceeded",
      "insufficient_quota",
      "credits_exceeded",
      "out of credits",
      "limit reached",
      "usage limit",
      "invalid_api_key",
      "api_key_invalid",
      "key_revoked",
      "expired",
      "unauthorized",
      "disabled",
      "account_disabled",
      "detected_unusual_activity",
      "blocked_key",
      "exceeds your quota",
      "character limit",
    ];

    for (const kw of quotaKeywords) {
      if (errorStr.includes(kw)) {
        return {
          shouldRotate: true,
          reason: `Quota or key status error in payload: "${kw}"`,
        };
      }
    }
  }

  // Do not rotate for network errors, 400 bad request, 422 unprocessable, 500 server errors
  return { shouldRotate: false };
}

/**
 * Checks whether a given string corresponds to a known ElevenLabs model identifier.
 */
export function isKnownModel(id?: string): boolean {
  if (!id) return false;
  const lower = id.trim().toLowerCase();
  return (
    lower.startsWith("eleven_") ||
    AVAILABLE_MODELS.some((m) => m.id.toLowerCase() === lower)
  );
}

/**
 * Resolves a model ID, normalizing aliases or defaulting safely.
 */
export function resolveModelId(id?: string): string {
  if (!id) return DEFAULT_MODEL_ID;
  const trimmed = id.trim();
  const matched = AVAILABLE_MODELS.find(
    (m) => m.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (matched) return matched.id;
  if (trimmed.startsWith("eleven_")) return trimmed;
  return DEFAULT_MODEL_ID;
}

/**
 * Resolves a voice identifier or voice name alias to its valid ElevenLabs Voice ID.
 */
export function resolveVoiceIdOrAlias(val?: string): string {
  if (!val) return DEFAULT_VOICE_ID;
  const trimmed = val.trim();
  // Check if matches a preset voice name (case-insensitive)
  const matchedByName = PREMADE_VOICES.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (matchedByName) return matchedByName.id;
  return trimmed;
}

/**
 * Serializes voiceId and modelId into a storage-safe JSON string for Vault voice_model_id.
 */
export function serializeVoiceConfig(voiceId: string, modelId: string): string {
  return JSON.stringify({
    voiceId: voiceId.trim() || DEFAULT_VOICE_ID,
    modelId: modelId.trim() || DEFAULT_MODEL_ID,
  });
}

/**
 * Resolves the appropriate voice ID and model ID based on the configured voice_model_id in Vault.
 * Robustly parses:
 * - JSON string: `{"voiceId": "...", "modelId": "..."}`
 * - Delimited string: `"voiceId:modelId"` or `"voiceId|modelId"`
 * - Model ID string: `"eleven_flash_v2_5"` (keeps default voice, assigns chosen model)
 * - Voice ID or voice alias: `"21m00Tcm4TlvDq8ikWAM"` or `"Rachel"` (assigns voice, uses default flash model)
 */
export function resolveVoiceAndModel(configuredVoiceModelId?: string): {
  voiceId: string;
  modelId: string;
} {
  const trimmed = (configuredVoiceModelId || "").trim();
  if (!trimmed) {
    return {
      voiceId: DEFAULT_VOICE_ID,
      modelId: DEFAULT_MODEL_ID,
    };
  }

  // 1. JSON object parsing
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawVoice = (parsed.voiceId || parsed.voice || "").trim();
      const rawModel = (parsed.modelId || parsed.model || "").trim();
      return {
        voiceId: resolveVoiceIdOrAlias(rawVoice) || DEFAULT_VOICE_ID,
        modelId: resolveModelId(rawModel),
      };
    } catch {
      // ignore JSON parse error and continue
    }
  }

  // 2. Delimited string parsing ("voiceId:modelId" or "voiceId|modelId")
  if (trimmed.includes(":") || trimmed.includes("|")) {
    const parts = trimmed.split(/[:|]/).map((s) => s.trim());
    const p1 = parts[0] || "";
    const p2 = parts[1] || "";

    if (isKnownModel(p1)) {
      return {
        voiceId: resolveVoiceIdOrAlias(p2) || DEFAULT_VOICE_ID,
        modelId: resolveModelId(p1),
      };
    }
    return {
      voiceId: resolveVoiceIdOrAlias(p1) || DEFAULT_VOICE_ID,
      modelId: isKnownModel(p2) ? resolveModelId(p2) : DEFAULT_MODEL_ID,
    };
  }

  // 3. If input is solely a model identifier (e.g. eleven_turbo_v2_5, eleven_flash_v2_5)
  if (isKnownModel(trimmed)) {
    return {
      voiceId: DEFAULT_VOICE_ID,
      modelId: resolveModelId(trimmed),
    };
  }

  // 4. Otherwise treat as Voice ID or voice name alias
  return {
    voiceId: resolveVoiceIdOrAlias(trimmed) || DEFAULT_VOICE_ID,
    modelId: DEFAULT_MODEL_ID,
  };
}

/**
 * Sends a text chunk to ElevenLabs and retrieves its audio Blob.
 * Strictly uses the voice model with the ID set in voice_config.
 * Automatically rotates through the configured API key array if quota or auth errors occur.
 * Attempts each available key at most once to prevent infinite loops.
 * Never leaks API keys in logs or errors.
 */
export async function generateChunkAudio(
  chunkText: string,
  options?: ChunkGenerationOptions
): Promise<Blob> {
  const cleanChunk = chunkText.trim();
  if (!cleanChunk) {
    throw new Error("Cannot generate audio for empty text chunk.");
  }

  const voiceStore = useVoiceStore.getState();
  const rawKeys = voiceStore.keys.map((k) => k?.trim()).filter(Boolean);

  if (rawKeys.length === 0) {
    throw new Error(
      "No ElevenLabs API keys configured. Please add an API key in Configurations > Voice & Mic."
    );
  }

  // Filter out known dead/revoked/exhausted keys
  const keys = keyQuotaManager.filterValidKeyList(rawKeys);
  if (keys.length === 0) {
    useVoiceStore.getState().markAllKeysExpired();
    throw new Error(
      "All configured ElevenLabs keys are exhausted (0 credits) or blocked by ElevenLabs. Please add a fresh API key in Configurations > Voice & Mic."
    );
  }

  // Ensure key ring is alive and auto-heal any temporary exhaustion
  keyQuotaManager.resetExhaustionIfAllExhausted(keys);

  const { voiceId: defaultVoice, modelId: defaultModel } = resolveVoiceAndModel(
    voiceStore.voiceModelId
  );
  const targetVoiceId = options?.voiceId || defaultVoice;
  const targetModelId = options?.modelId || defaultModel;

  // Retrieve saved active key from keyQuotaManager rather than always starting from index 0
  const activeKeyInfo = keyQuotaManager.getActiveKey(keys);
  const initialKeyIndex = activeKeyInfo.index;

  let currentAttempt = 0;
  const totalKeys = keys.length;

  while (currentAttempt < totalKeys) {
    const activeKeyIndex = (initialKeyIndex + currentAttempt) % totalKeys;
    const activeApiKey = keys[activeKeyIndex];

    // Proactive rotation: if key is near 8,800 characters and another key exists, advance proactively
    if (totalKeys > 1 && keyQuotaManager.isAboutToExhaust(activeApiKey, cleanChunk.length)) {
      console.warn(
        `[ElevenLabs] Key #${activeKeyIndex + 1} is near quota limit (8,800 chars). Proactively rotating.`
      );
      currentAttempt++;
      continue;
    }

    try {
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        targetVoiceId
      )}?output_format=mp3_44100_128`;

      console.log(
        `[ElevenLabs] Sending TTS request using voice model ID: "${targetVoiceId}", model: "${targetModelId}" (key #${activeKeyIndex + 1})`
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "xi-api-key": activeApiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleanChunk,
          model_id: targetModelId,
          voice_settings: {
            stability: options?.stability ?? 0.5,
            similarity_boost: options?.similarityBoost ?? 0.75,
            use_speaker_boost: options?.useSpeakerBoost ?? true,
          },
        }),
      });

      // Success
      if (response.ok) {
        console.log(
          `[ElevenLabs] Generated audio using voice model ID "${targetVoiceId}" with key #${activeKeyIndex + 1}`
        );
        // Record character usage and store successful active key
        keyQuotaManager.recordUsage(activeApiKey, cleanChunk.length);
        keyQuotaManager.setActiveKey(activeApiKey, activeKeyIndex);

        if (activeKeyIndex !== voiceStore.currentKeyIndex) {
          useVoiceStore
            .getState()
            .updateKeyIndex(activeKeyIndex)
            .catch((err) => {
              console.debug(
                `[ElevenLabs] Synchronized active key index to #${activeKeyIndex + 1}:`,
                err
              );
            });
        }
        return await response.blob();
      }

      // Handle HTTP error response
      let errorPayload: unknown;
      try {
        errorPayload = await response.json();
      } catch {
        try {
          errorPayload = await response.text();
        } catch {
          errorPayload = null;
        }
      }

      const rotationCheck = isKeyRotationError(response.status, errorPayload);

      if (rotationCheck.shouldRotate) {
        const errorStr = (
          typeof errorPayload === "string" ? errorPayload : JSON.stringify(errorPayload) || ""
        ).toLowerCase();

        if (response.status === 402 || errorStr.includes("quota") || errorStr.includes("credit")) {
          keyQuotaManager.markKeyStatus(activeApiKey, "exhausted");
        } else if (response.status === 401 || errorStr.includes("invalid_api_key")) {
          keyQuotaManager.markKeyStatus(activeApiKey, "invalid");
        }

        if (currentAttempt < totalKeys - 1) {
          const nextKeyIndex = (activeKeyIndex + 1) % totalKeys;
          console.warn(
            `[ElevenLabs] Key #${activeKeyIndex + 1} unavailable (${
              rotationCheck.reason
            }). Rotating to next Key #${nextKeyIndex + 1} (${currentAttempt + 1}/${totalKeys}).`
          );

          // Store next active key persistently
          keyQuotaManager.setActiveKey(keys[nextKeyIndex], nextKeyIndex);

          useVoiceStore
            .getState()
            .updateKeyIndex(nextKeyIndex)
            .catch((err) => {
              console.debug("[ElevenLabs] Failed to persist rotated key index:", err);
            });

          currentAttempt++;
          continue; // Try next key silently without toast
        } else {
          // Reached full circle!
          console.warn(
            `[ElevenLabs] All ${totalKeys} keys cycled through. Auto-resetting statuses to keep ring alive.`
          );
          keyQuotaManager.resetAllKeyStatuses(keys);
          useVoiceStore.getState().markAllKeysExpired();

          throw new Error(
            `ElevenLabs generation failed after attempting all keys. All keys are either quota-exhausted or blocked. Please check your ElevenLabs credentials in Configurations > Voice & Mic.`
          );
        }
      }

      // Unrelated HTTP error (e.g. malformed text, 400 Bad Request, 500 Internal Error)
      const errMessage =
        typeof errorPayload === "object" && errorPayload !== null
          ? JSON.stringify(errorPayload)
          : String(errorPayload || response.statusText);

      throw new Error(`ElevenLabs HTTP ${response.status}: ${errMessage}`);
    } catch (err: unknown) {
      if ((err as Error)?.message?.includes("stopped until new keys are added")) {
        throw err;
      }

      // If error is already an unrotatable ElevenLabs error, rethrow immediately
      const errorMsg = (err as Error)?.message || "";
      if (errorMsg.startsWith("ElevenLabs HTTP")) {
        throw err;
      }

      // If network failure or abort error, do NOT rotate keys; rethrow
      if (
        (err as Error)?.name === "AbortError" ||
        (err as Error)?.name === "TypeError"
      ) {
        throw new Error(
          `ElevenLabs network connection failed: ${
            (err as Error)?.message || "Check your internet connection"
          }`
        );
      }

      throw err;
    }
  }

  // All keys exhausted
  throw new Error(
    `ElevenLabs audio generation failed after attempting all ${totalKeys} keys. Please check your voice model configuration or credits.`
  );
}
