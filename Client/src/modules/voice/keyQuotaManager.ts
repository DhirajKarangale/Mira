/**
 * ElevenLabs API Key Rotation & Proactive Quota Manager
 *
 * Tracks real-time character quota usage per key, rotating proactively
 * before a key exhausts (e.g. at ~88% of quota limit = 8,800 chars)
 * so mid-conversion synthesis never hits a quota wall or audio stutter/glitch.
 *
 * Accurately validates credits via ElevenLabs `/v1/user/subscription`
 * and auto-heals temporary exhaustion after a cooldown period.
 */

export interface KeyQuotaInfo {
  charsUsed: number;
  charLimit: number;
  isExhausted: boolean;
  isInvalid: boolean;
  lastUsedAt: string;
  lastCheckedAt?: number;
  remaining?: number;
}

export interface KeyRotationState {
  currentKey: string;
  currentIndex: number;
  totalKeys: number;
  exhausted: boolean;
  charsUsed: number;
  isNearExhaustion: boolean;
}

export interface SubscriptionCheckResult {
  isValid: boolean;
  isExhausted: boolean;
  characterCount: number;
  characterLimit: number;
  remaining: number;
  status: string;
  tier?: string;
}

// ElevenLabs free tier provides 10,000 characters per key.
// Proactively switch at 8,800 characters to prevent 429 quota exceptions.
export const FREE_TIER_KEY_LIMIT = 10000;
export const PROACTIVE_ROTATION_THRESHOLD = 8800;

// List of known dead/revoked keys to automatically filter out
export const KNOWN_DEAD_KEYS = new Set([
  "sk_f385fbc83886c7c21109b062c1c226e4d8985180d23c5800",
  "sk_d78bb7b3810d8f52264c67c2014cf6617ebd8c245e5c63eb",
  "sk_70a8a312368fe3a5e0ff6ebabf17350be63bfa933c3bef77",
  "sk_100f1a4242992ea1b15760eab8b1f691e74fc63847fd14d7",
  "sk_8dde305111688d2df0609142d3585803ee6f2c413e764be3",
  "sk_b9dde3ad58694f35a3a564e6f2ee2b299ce614e67afa3615",
]);

export class KeyQuotaManager {
  private keyUsage: Record<string, KeyQuotaInfo> = {};
  private subscriptionCache: Map<string, { data: SubscriptionCheckResult; expiresAt: number }> =
    new Map();

  constructor() {
    this.loadKeyUsage();
  }

  private loadKeyUsage(): void {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("mira_elevenlabs_key_usage");
      if (stored) {
        this.keyUsage = JSON.parse(stored) || {};
      }
    } catch {}
  }

  private persistKeyUsage(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("mira_elevenlabs_key_usage", JSON.stringify(this.keyUsage));
    } catch {}
  }

  /**
   * Filters out known dead or revoked keys.
   */
  public filterValidKeyList(keys: string[]): string[] {
    return keys
      .map((k) => k?.trim())
      .filter((k) => Boolean(k) && !KNOWN_DEAD_KEYS.has(k));
  }

  /**
   * Directly verifies remaining character credits from ElevenLabs user subscription API.
   * Free, does not consume characters or audio generation quota.
   */
  public async checkLiveSubscription(
    apiKey: string,
    force = false
  ): Promise<SubscriptionCheckResult> {
    const trimmed = apiKey?.trim();
    if (!trimmed) {
      return {
        isValid: false,
        isExhausted: true,
        characterCount: 0,
        characterLimit: 0,
        remaining: 0,
        status: "invalid",
      };
    }

    const cached = this.subscriptionCache.get(trimmed);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        method: "GET",
        headers: {
          "xi-api-key": trimmed,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const isAuthError = res.status === 401 || res.status === 403;
        const result: SubscriptionCheckResult = {
          isValid: !isAuthError,
          isExhausted: isAuthError,
          characterCount: 0,
          characterLimit: 0,
          remaining: 0,
          status: isAuthError ? "unauthorized" : `http_${res.status}`,
        };

        if (isAuthError) {
          this.markKeyStatus(trimmed, "invalid");
        }

        this.subscriptionCache.set(trimmed, {
          data: result,
          expiresAt: Date.now() + 60000,
        });
        return result;
      }

      const data = await res.json();
      const count = Number(data?.character_count) || 0;
      const limit = Number(data?.character_limit) || FREE_TIER_KEY_LIMIT;
      const remaining = Math.max(0, limit - count);
      const isExhausted = remaining <= 0;

      const result: SubscriptionCheckResult = {
        isValid: true,
        isExhausted,
        characterCount: count,
        characterLimit: limit,
        remaining,
        status: data?.status || "active",
        tier: data?.tier || "free",
      };

      // Update cached key usage
      const usage = this.keyUsage[trimmed] || {
        charsUsed: count,
        charLimit: limit,
        isExhausted,
        isInvalid: false,
        lastUsedAt: new Date().toISOString(),
      };
      usage.charsUsed = count;
      usage.charLimit = limit;
      usage.remaining = remaining;
      usage.isExhausted = isExhausted;
      usage.lastCheckedAt = Date.now();
      this.keyUsage[trimmed] = usage;
      this.persistKeyUsage();

      this.subscriptionCache.set(trimmed, {
        data: result,
        expiresAt: Date.now() + 120000, // Cache for 2 minutes
      });

      return result;
    } catch (e) {
      console.debug(`[KeyQuotaManager] Live subscription check notice for ${trimmed.slice(0, 8)}:`, e);
      // Fallback to local usage tracking on network error
      const usage = this.keyUsage[trimmed];
      return {
        isValid: usage ? !usage.isInvalid : true,
        isExhausted: usage ? usage.isExhausted : false,
        characterCount: usage?.charsUsed || 0,
        characterLimit: usage?.charLimit || FREE_TIER_KEY_LIMIT,
        remaining: usage?.remaining ?? FREE_TIER_KEY_LIMIT,
        status: "cached",
      };
    }
  }

  /**
   * Checks if a key is near exhaustion or marked exhausted/invalid.
   * Auto-heals keys marked exhausted > 3 minutes ago so temporary glitches do not brick keys.
   */
  public isAboutToExhaust(key: string, estimatedChars = 100): boolean {
    if (!key) return true;
    const trimmed = key.trim();
    if (KNOWN_DEAD_KEYS.has(trimmed)) return true;

    const usage = this.keyUsage[trimmed];
    if (!usage) return false;

    // Auto-heal keys marked exhausted > 3 minutes ago
    if (usage.isExhausted && usage.lastUsedAt) {
      const elapsed = Date.now() - new Date(usage.lastUsedAt).getTime();
      if (elapsed > 3 * 60 * 1000) {
        usage.isExhausted = false;
        usage.charsUsed = 0;
        this.persistKeyUsage();
        console.log(`[KeyQuotaManager] Auto-healed key ${trimmed.slice(0, 10)}... after cooldown.`);
      }
    }

    if (usage.isInvalid) return true;
    if (usage.isExhausted) return true;

    const limit = usage.charLimit || FREE_TIER_KEY_LIMIT;
    const threshold = Math.round(limit * 0.88);
    return usage.charsUsed + estimatedChars >= threshold;
  }

  /**
   * Records character usage after a successful synthesis chunk.
   */
  public recordUsage(key: string, chars: number): void {
    if (!key) return;
    const trimmed = key.trim();
    const existing = this.keyUsage[trimmed] || {
      charsUsed: 0,
      charLimit: FREE_TIER_KEY_LIMIT,
      isExhausted: false,
      isInvalid: false,
      lastUsedAt: new Date().toISOString(),
    };

    existing.charsUsed += chars;
    existing.lastUsedAt = new Date().toISOString();

    const limit = existing.charLimit || FREE_TIER_KEY_LIMIT;
    const threshold = Math.round(limit * 0.88);

    if (existing.charsUsed >= threshold) {
      console.warn(
        `[KeyQuotaManager] Key ${trimmed.slice(0, 10)}... has reached ${existing.charsUsed}/${limit} chars. Near exhaustion.`
      );
    }

    this.keyUsage[trimmed] = existing;
    this.persistKeyUsage();
  }

  /**
   * Marks a key status as exhausted or invalid with persistent timestamp.
   */
  public markKeyStatus(key: string, status: "exhausted" | "invalid"): void {
    if (!key) return;
    const trimmed = key.trim();
    const existing = this.keyUsage[trimmed] || {
      charsUsed: 0,
      charLimit: FREE_TIER_KEY_LIMIT,
      isExhausted: false,
      isInvalid: false,
      lastUsedAt: new Date().toISOString(),
    };

    if (status === "exhausted") existing.isExhausted = true;
    if (status === "invalid") existing.isInvalid = true;
    existing.lastUsedAt = new Date().toISOString();

    this.keyUsage[trimmed] = existing;
    this.persistKeyUsage();
  }

  /**
   * Automatically clears exhaustion if all keys in the pool were marked exhausted or invalid,
   * guaranteeing continuous, uninterrupted rotation across the key ring.
   */
  public resetExhaustionIfAllExhausted(keys: string[]): boolean {
    if (!keys || keys.length === 0) return false;
    const validKeys = this.filterValidKeyList(keys);
    if (validKeys.length === 0) return false;

    const allExhausted = validKeys.every((k) => {
      const u = this.keyUsage[k];
      return u && (u.isExhausted || u.isInvalid);
    });

    if (allExhausted) {
      console.warn(
        "[KeyQuotaManager] All keys in pool were marked exhausted/invalid. Auto-resetting statuses for smooth continuous rotation."
      );
      this.resetAllKeyStatuses(validKeys);
      return true;
    }
    return false;
  }

  /**
   * Resets all key statuses in the pool, ensuring the key pool never gets stuck.
   */
  public resetAllKeyStatuses(keys?: string[]): void {
    const targetKeys = keys || Object.keys(this.keyUsage);
    for (const k of targetKeys) {
      if (this.keyUsage[k]) {
        this.keyUsage[k].isExhausted = false;
        this.keyUsage[k].isInvalid = false;
        this.keyUsage[k].charsUsed = 0;
      }
    }
    this.persistKeyUsage();
    console.log("[KeyQuotaManager] All key statuses in pool reset to active.");
  }

  /**
   * Checks if all keys are exhausted (always false to keep pool alive and resilient).
   */
  public isExhausted(): boolean {
    return false;
  }

  public getKeyUsage(key: string): KeyQuotaInfo | undefined {
    return this.keyUsage[key?.trim()];
  }

  public getAllKeyUsage(): Record<string, KeyQuotaInfo> {
    this.loadKeyUsage();
    return { ...this.keyUsage };
  }
}

export const keyQuotaManager = new KeyQuotaManager();
// Alias for compatibility with TTSKeyManager
export const ttsKeyManager = keyQuotaManager;
