import { useVoiceStore } from "@/store/useVoiceStore";
import { keyQuotaManager } from "./keyQuotaManager";
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
 * Resolves the appropriate voice ID and model ID based strictly on the configured voice_model_id in Vault.
 */
function resolveVoiceAndModel(configuredVoiceModelId?: string): {
  voiceId: string;
  modelId: string;
} {
  const trimmed = (configuredVoiceModelId || "").trim();
  return {
    voiceId: trimmed || DEFAULT_VOICE_ID,
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

  // Filter out known dead/revoked keys
  const keys = keyQuotaManager.filterValidKeyList(rawKeys);
  if (keys.length === 0) {
    throw new Error(
      "All configured ElevenLabs keys are known dead or revoked. Please add an active key in Configurations > Voice & Mic."
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

          throw new Error(
            `ElevenLabs generation failed after attempting all ${totalKeys} keys. Please check your voice ID or credits.`
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
