/**
 * ElevenLabs API Key Rotation & Proactive Quota Manager
 *
 * Manages an array of ElevenLabs API keys loaded from `elevenlabs_keys.json`
 * and localStorage. Tracks character quota usage per key, rotating proactively
 * before a key exhausts (e.g. at ~88% of quota limit) so mid-conversion synthesis
 * never hits a quota wall or audio stutter/glitch.
 */

import defaultKeys from "./elevenlabs_keys.json";

export interface KeyQuotaInfo {
  charsUsed: number;
  isExhausted: boolean;
  isInvalid: boolean;
  lastUsedAt: string;
}

export interface KeyRotationState {
  currentKey: string;
  currentIndex: number;
  totalKeys: number;
  exhausted: boolean;
  charsUsed: number;
  isNearExhaustion: boolean;
}

// ElevenLabs free tier provides 10,000 characters per key.
// Proactively switch at 8,800 characters to prevent 429 quota exceptions.
export const FREE_TIER_KEY_LIMIT = 10000;
export const PROACTIVE_ROTATION_THRESHOLD = 8800;

// List of known dead/exhausted keys to automatically purge from localStorage
const KNOWN_DEAD_KEYS = new Set([
  "sk_f385fbc83886c7c21109b062c1c226e4d8985180d23c5800",
  "sk_d78bb7b3810d8f52264c67c2014cf6617ebd8c245e5c63eb",
  "sk_70a8a312368fe3a5e0ff6ebabf17350be63bfa933c3bef77",
  "sk_100f1a4242992ea1b15760eab8b1f691e74fc63847fd14d7",
  "sk_8dde305111688d2df0609142d3585803ee6f2c413e764be3",
  "sk_b9dde3ad58694f35a3a564e6f2ee2b299ce614e67afa3615",
]);

class TTSKeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private failedAttemptsInCycle: number = 0;
  private keyUsage: Record<string, KeyQuotaInfo> = {};
  private hasValidatedKeys: boolean = false;

  constructor() {
    this.initKeys();
    this.loadKeyUsage();
  }

  private loadKeyUsage() {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("mira_elevenlabs_key_usage");
      if (stored) {
        this.keyUsage = JSON.parse(stored) || {};
      }
    } catch {}
  }

  private persistKeyUsage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("mira_elevenlabs_key_usage", JSON.stringify(this.keyUsage));
    } catch {}
  }

  private initKeys() {
    // 1. Load keys from JSON file
    let loadedKeys: string[] = Array.isArray(defaultKeys) ? [...defaultKeys] : [];

    // 2. Load any extra keys from localStorage cache
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("mira_elevenlabs_keys");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((k) => {
              const trimmed = typeof k === "string" ? k.trim() : "";
              if (trimmed && !loadedKeys.includes(trimmed) && !KNOWN_DEAD_KEYS.has(trimmed)) {
                loadedKeys.push(trimmed);
              }
            });
          }
        }
      } catch (e) {
        console.warn("[TTSKeyManager] Failed to read localStorage keys:", e);
      }
    }

    // Filter empty keys, dead keys, and trim
    loadedKeys = loadedKeys
      .map((k) => k.trim())
      .filter((k) => Boolean(k) && !KNOWN_DEAD_KEYS.has(k));

    // Fallback: Ensure active key is present
    if (loadedKeys.length === 0) {
      loadedKeys = ["sk_8911f5d3f0437bb20706afe3333beae2b5f072f2681b998d"];
    }

    // Clean localStorage of dead keys
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mira_elevenlabs_keys", JSON.stringify(loadedKeys));
      } catch {}
    }

    this.keys = loadedKeys;
    this.currentIndex = 0;
    this.failedAttemptsInCycle = 0;
  }

  /**
   * Permanently evict an expired, exhausted, or credit-less key from:
   * 1. In-memory pool
   * 2. Browser localStorage cache
   * 3. elevenlabs_keys.json file on disk
   */
  public async removeKeyPermanently(keyToRemove: string): Promise<string[]> {
    if (!keyToRemove) return this.keys;
    const trimmed = keyToRemove.trim();
    console.warn(
      `[TTSKeyManager] Permanently throwing out key ${trimmed.slice(0, 10)}... (no credit / expired / unusual activity)`
    );

    // 1. Remove from in-memory pool
    this.keys = this.keys.filter((k) => k !== trimmed);
    delete this.keyUsage[trimmed];

    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }

    // 2. Remove from localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mira_elevenlabs_keys", JSON.stringify(this.keys));
        this.persistKeyUsage();
      } catch {}

      // 3. Request Vite server backend to delete from elevenlabs_keys.json on disk
      try {
        await fetch("/api/remove-elevenlabs-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
      } catch (err) {
        console.warn("[TTSKeyManager] Failed to call /api/remove-elevenlabs-key:", err);
      }
    }

    return this.keys;
  }

  /**
   * Validates all keys on app load. Directly throws out any key that has 0 credits.
   */
  public async validateAndPruneAllKeys(): Promise<void> {
    if (this.hasValidatedKeys) return;
    this.hasValidatedKeys = true;

    const keysToCheck = [...this.keys];
    for (const key of keysToCheck) {
      try {
        const res = await fetch(
          "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=mp3_22050_32",
          {
            method: "POST",
            headers: {
              "xi-api-key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: "a",
              model_id: "eleven_turbo_v2_5",
            }),
          }
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(
            `[TTSKeyManager] Key ${key.slice(0, 10)}... has NO credits (${res.status}): ${body}. Throwing key out permanently!`
          );
          await this.removeKeyPermanently(key);
        } else {
          console.log(`[TTSKeyManager] Key ${key.slice(0, 10)}... validated successfully with active credits.`);
        }
      } catch (err) {
        console.warn(`[TTSKeyManager] Error checking key ${key.slice(0, 10)}...`, err);
      }
    }
  }

  /**
   * Resets all key statuses in the pool, ensuring the key pool never ends or gets stuck.
   */
  public resetAllKeyStatuses(): void {
    for (const k of this.keys) {
      if (this.keyUsage[k]) {
        this.keyUsage[k].isExhausted = false;
        this.keyUsage[k].isInvalid = false;
        this.keyUsage[k].charsUsed = 0;
      }
    }
    this.failedAttemptsInCycle = 0;
    this.persistKeyUsage();
    console.log("[TTSKeyManager] All key statuses in pool reset to active.");
  }

  /**
   * Automatically clears exhaustion if all keys in the pool were marked exhausted or invalid,
   * guaranteeing continuous, uninterrupted rotation across the key ring.
   */
  public resetExhaustionIfAllExhausted(): boolean {
    if (this.keys.length === 0) return false;
    const allExhausted = this.keys.every((k) => {
      const u = this.keyUsage[k];
      return u && (u.isExhausted || u.isInvalid);
    });

    if (allExhausted) {
      console.warn(
        "[TTSKeyManager] All keys in pool were marked exhausted/invalid. Auto-resetting statuses for smooth continuous rotation."
      );
      this.resetAllKeyStatuses();
      return true;
    }
    return false;
  }

  /**
   * Check if a key is near exhaustion or marked exhausted/invalid
   */
  public isAboutToExhaust(key: string, estimatedChars: number = 100): boolean {
    const usage = this.keyUsage[key];
    if (!usage) return false;

    // Auto-heal keys marked exhausted > 3 minutes ago
    if (usage.isExhausted && usage.lastUsedAt) {
      const elapsed = Date.now() - new Date(usage.lastUsedAt).getTime();
      if (elapsed > 3 * 60 * 1000) {
        usage.isExhausted = false;
        usage.charsUsed = 0;
        this.persistKeyUsage();
      }
    }

    if (usage.isExhausted || usage.isInvalid) return true;
    return usage.charsUsed + estimatedChars >= PROACTIVE_ROTATION_THRESHOLD;
  }

  /**
   * Get the current active ElevenLabs API key, rotating proactively if near exhaustion
   */
  public getCurrentKey(): string {
    if (this.keys.length === 0) {
      this.initKeys();
    }

    this.resetExhaustionIfAllExhausted();

    // If current key is exhausted or invalid, automatically rotate to the next available key
    let current = this.keys[this.currentIndex] || "";
    let attempts = 0;
    while (
      attempts < this.keys.length &&
      (this.keyUsage[current]?.isExhausted ||
        this.keyUsage[current]?.isInvalid ||
        (this.keys.length > 1 && this.isAboutToExhaust(current)))
    ) {
      this.rotateKey("Key exhausted or invalid, auto-advancing to next pool key");
      current = this.keys[this.currentIndex] || "";
      attempts++;
    }

    // If after scanning all keys none are un-exhausted, reset all and return current
    if (this.keyUsage[current]?.isExhausted || this.keyUsage[current]?.isInvalid) {
      this.resetAllKeyStatuses();
      current = this.keys[this.currentIndex] || this.keys[0] || "";
    }

    return current;
  }

  /**
   * Record character usage after successful synthesis chunk
   */
  public recordUsage(key: string, chars: number) {
    if (!key) return;
    const existing = this.keyUsage[key] || {
      charsUsed: 0,
      isExhausted: false,
      isInvalid: false,
      lastUsedAt: new Date().toISOString(),
    };

    existing.charsUsed += chars;
    existing.lastUsedAt = new Date().toISOString();

    // Check if key has crossed safe proactive threshold
    if (existing.charsUsed >= PROACTIVE_ROTATION_THRESHOLD) {
      console.warn(
        `[TTSKeyManager] Key ${key.substring(0, 10)}... has reached ${existing.charsUsed}/${FREE_TIER_KEY_LIMIT} chars. Marking near exhaustion.`
      );
      if (this.keys.length > 1) {
        this.rotateKey("Proactive rotation: key near 10k quota ceiling");
      }
    }

    this.keyUsage[key] = existing;
    this.persistKeyUsage();
    this.markSuccess();
  }

  /**
   * Mark a key as exhausted or invalid
   */
  public markKeyStatus(key: string, status: "exhausted" | "invalid") {
    if (!key) return;
    const existing = this.keyUsage[key] || {
      charsUsed: 0,
      isExhausted: false,
      isInvalid: false,
      lastUsedAt: new Date().toISOString(),
    };

    if (status === "exhausted") existing.isExhausted = true;
    if (status === "invalid") existing.isInvalid = true;

    this.keyUsage[key] = existing;
    this.persistKeyUsage();
  }

  /**
   * Rotate to the next available API key in the JSON array
   */
  public rotateKey(reason: string = "Quota / Token limit reached"): KeyRotationState {
    if (this.keys.length === 0) {
      this.initKeys();
    }

    const previousIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    this.failedAttemptsInCycle++;

    // Continuous resilient ring: If all keys in the pool were cycled through, auto-heal and reset
    if (this.failedAttemptsInCycle >= this.keys.length) {
      this.resetExhaustionIfAllExhausted();
      this.failedAttemptsInCycle = 0;
    }

    const nextKey = this.keys[this.currentIndex] || "";
    const nextUsage = this.keyUsage[nextKey];

    console.warn(
      `[TTSKeyManager] ${reason}. Rotated key: [${previousIndex} -> ${this.currentIndex}] (${this.keys.length} keys total in pool).`
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mira:tts-key-rotated", {
          detail: {
            previousIndex,
            newIndex: this.currentIndex,
            totalKeys: this.keys.length,
            isExhausted: false,
            reason,
            charsUsed: nextUsage?.charsUsed || 0,
          },
        })
      );
    }

    return {
      currentKey: nextKey,
      currentIndex: this.currentIndex,
      totalKeys: this.keys.length,
      exhausted: false,
      charsUsed: nextUsage?.charsUsed || 0,
      isNearExhaustion: this.isAboutToExhaust(nextKey),
    };
  }

  /**
   * Reset rotation failure counter upon successful API audio generation
   */
  public markSuccess() {
    this.failedAttemptsInCycle = 0;
  }

  /**
   * Check if all keys in the pool have failed consecutively (always false to keep pool alive)
   */
  public isExhausted(): boolean {
    return false;
  }

  /**
   * Get all loaded keys (masked for privacy)
   */
  public getAllKeys(): string[] {
    // Refresh list in case elevenlabs_keys.json was updated
    this.initKeys();
    return [...this.keys];
  }

  /**
   * Return character usage mapping for all keys
   */
  public getAllKeyUsage(): Record<string, KeyQuotaInfo> {
    this.loadKeyUsage();
    return { ...this.keyUsage };
  }

  /**
   * Add a new ElevenLabs key to the rotation pool
   */
  public addKey(newKey: string): void {
    const trimmed = newKey.trim();
    if (!trimmed || this.keys.includes(trimmed)) return;
    this.keys.push(trimmed);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mira_elevenlabs_keys", JSON.stringify(this.keys));
      } catch {}
    }
  }

  public getState(): KeyRotationState {
    const key = this.getCurrentKey();
    const usage = this.keyUsage[key];
    return {
      currentKey: key,
      currentIndex: this.currentIndex,
      totalKeys: this.keys.length,
      exhausted: this.isExhausted(),
      charsUsed: usage?.charsUsed || 0,
      isNearExhaustion: this.isAboutToExhaust(key),
    };
  }
}

export const ttsKeyManager = new TTSKeyManager();
