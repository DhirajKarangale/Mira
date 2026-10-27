import { useVoiceStore } from "@/store/useVoiceStore";
import type { KeyRotationCheckResult, ChunkGenerationOptions } from "./types";

// Verified premade voices available to all ElevenLabs tiers (including Free accounts):
// Sarah: "EXAVITQu4vr4xnSDxMaL" (Mature, Reassuring)
// Alice: "Xb7hH8MSUJpSbSDYk0k2" (Clear Educator)
// George: "JBFqnCBsd6RMkjVDRZzb" (Warm Storyteller)
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (Verified premade voice)
export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

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
  // If the error indicates a library/cloned voice requires a paid subscription,
  // do NOT rotate keys because all free tier keys will hit the exact same restriction.
  if (errorData) {
    const errorStr = (
      typeof errorData === "string" ? errorData : JSON.stringify(errorData)
    ).toLowerCase();

    if (
      errorStr.includes("paid_plan_required") ||
      errorStr.includes("library voices") ||
      errorStr.includes("voice_not_found")
    ) {
      return {
        shouldRotate: false,
        reason: "Voice requires a paid ElevenLabs plan or is missing; not an API key quota failure",
      };
    }
  }

  // 1. Authentication failure
  if (statusCode === 401) {
    return {
      shouldRotate: true,
      reason: "Authentication error (HTTP 401): invalid, missing, or expired API key",
    };
  }

  // 2. Quota exhaustion / payment required for account credits
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
      "detected_unusual_activity",
      "blocked_key",
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
 * Resolves the appropriate voice ID and model ID based on the configured voiceModelId in Vault.
 */
function resolveVoiceAndModel(configuredModelId?: string): {
  voiceId: string;
  modelId: string;
} {
  const trimmed = (configuredModelId || "").trim();
  if (!trimmed) {
    return { voiceId: DEFAULT_VOICE_ID, modelId: DEFAULT_MODEL_ID };
  }

  // If user entered a known model identifier (e.g. eleven_multilingual_v2, eleven_turbo_v2_5)
  if (
    trimmed.startsWith("eleven_") ||
    trimmed.includes("multilingual") ||
    trimmed.includes("turbo") ||
    trimmed.includes("flash")
  ) {
    return { voiceId: DEFAULT_VOICE_ID, modelId: trimmed };
  }

  // Otherwise assume it is a custom voice ID or cloned voice token hash
  return { voiceId: trimmed, modelId: DEFAULT_MODEL_ID };
}

/**
 * Sends a text chunk to ElevenLabs and retrieves its audio Blob.
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
  const keys = voiceStore.keys.map((k) => k?.trim()).filter(Boolean);

  if (keys.length === 0) {
    throw new Error(
      "No ElevenLabs API keys configured. Please add an API key in Configurations > Voice & Mic."
    );
  }

  const { voiceId: defaultVoice, modelId: defaultModel } = resolveVoiceAndModel(
    voiceStore.voiceModelId
  );
  let effectiveVoiceId = options?.voiceId || defaultVoice;
  const targetModelId = options?.modelId || defaultModel;

  const initialKeyIndex = Math.max(
    0,
    Math.min(voiceStore.currentKeyIndex, keys.length - 1)
  );

  let currentAttempt = 0;
  const totalKeys = keys.length;
  let hasFallenBackToDefaultVoice = effectiveVoiceId === DEFAULT_VOICE_ID;

  while (currentAttempt < totalKeys) {
    const activeKeyIndex = (initialKeyIndex + currentAttempt) % totalKeys;
    const activeApiKey = keys[activeKeyIndex];

    try {
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        effectiveVoiceId
      )}?output_format=mp3_44100_128`;

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
          },
        }),
      });

      // Success
      if (response.ok) {
        // If we rotated away from the previous key index, persist the new active key in background
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

      // Check if error is specifically due to a library / paid / non-existent voice
      const errorStr = (
        typeof errorPayload === "string"
          ? errorPayload
          : JSON.stringify(errorPayload || "")
      ).toLowerCase();

      const isVoiceRestricted =
        errorStr.includes("paid_plan_required") ||
        errorStr.includes("library voices") ||
        errorStr.includes("voice_not_found") ||
        errorStr.includes("voice not found") ||
        errorStr.includes("does not exist");

      if (isVoiceRestricted && !hasFallenBackToDefaultVoice) {
        console.warn(
          `[ElevenLabs] Custom voice "${effectiveVoiceId}" requires a paid ElevenLabs plan (library voice). Automatically falling back to premade voice "${DEFAULT_VOICE_ID}" (Sarah).`
        );
        effectiveVoiceId = DEFAULT_VOICE_ID;
        hasFallenBackToDefaultVoice = true;
        // Retry immediately on the current key with the reliable default voice
        continue;
      }

      const rotationCheck = isKeyRotationError(response.status, errorPayload);

      if (rotationCheck.shouldRotate) {
        console.warn(
          `[ElevenLabs] Key #${activeKeyIndex + 1} unavailable (${
            rotationCheck.reason
          }). Attempting rotation to next key (${currentAttempt + 1}/${totalKeys}).`
        );
        currentAttempt++;
        continue; // Try next key
      }

      // Unrelated HTTP error (e.g. malformed text, 400 Bad Request, 500 Internal Error)
      const errMessage =
        typeof errorPayload === "object" && errorPayload !== null
          ? JSON.stringify(errorPayload)
          : String(errorPayload || response.statusText);

      throw new Error(`ElevenLabs HTTP ${response.status}: ${errMessage}`);
    } catch (err: unknown) {
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
    `All configured ElevenLabs API keys (${totalKeys}) failed due to expired, invalid, or exhausted quotas.`
  );
}
