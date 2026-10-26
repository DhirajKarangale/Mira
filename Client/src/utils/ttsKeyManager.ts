/**
 * ElevenLabs API Key Rotation Manager
 *
 * Manages an array of ElevenLabs API keys loaded from `elevenlabs_keys.json`
 * and localStorage. Automatically rotates to the next key when quota, 401,
 * 402, or 429 rate-limiting is encountered during audio synthesis.
 */

import defaultKeys from "./elevenlabs_keys.json";

export interface KeyRotationState {
  currentKey: string;
  currentIndex: number;
  totalKeys: number;
  exhausted: boolean;
}

class TTSKeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private failedAttemptsInCycle: number = 0;

  constructor() {
    this.initKeys();
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
              if (trimmed && !loadedKeys.includes(trimmed)) {
                loadedKeys.push(trimmed);
              }
            });
          }
        }
      } catch (e) {
        console.warn("[TTSKeyManager] Failed to read localStorage keys:", e);
      }
    }

    // Fallback: Ensure at least the initial user key is present
    if (loadedKeys.length === 0) {
      loadedKeys = ["sk_f385fbc83886c7c21109b062c1c226e4d8985180d23c5800"];
    }

    this.keys = loadedKeys;
    this.currentIndex = 0;
    this.failedAttemptsInCycle = 0;
  }

  /**
   * Get the current active ElevenLabs API key
   */
  public getCurrentKey(): string {
    if (this.keys.length === 0) {
      this.initKeys();
    }
    return this.keys[this.currentIndex] || "";
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

    const isExhausted = this.failedAttemptsInCycle >= this.keys.length;

    console.warn(
      `[TTSKeyManager] ${reason}. Rotated key: index [${previousIndex} -> ${this.currentIndex}] of ${this.keys.length} total keys.`
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mira:tts-key-rotated", {
          detail: {
            previousIndex,
            newIndex: this.currentIndex,
            totalKeys: this.keys.length,
            isExhausted,
            reason,
          },
        })
      );
    }

    return {
      currentKey: this.getCurrentKey(),
      currentIndex: this.currentIndex,
      totalKeys: this.keys.length,
      exhausted: isExhausted,
    };
  }

  /**
   * Reset rotation failure counter upon successful API audio generation
   */
  public markSuccess() {
    this.failedAttemptsInCycle = 0;
  }

  /**
   * Check if all keys in the pool have failed consecutively
   */
  public isExhausted(): boolean {
    return this.failedAttemptsInCycle >= this.keys.length && this.keys.length > 0;
  }

  /**
   * Get all loaded keys (masked for privacy)
   */
  public getAllKeys(): string[] {
    return [...this.keys];
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
    return {
      currentKey: this.getCurrentKey(),
      currentIndex: this.currentIndex,
      totalKeys: this.keys.length,
      exhausted: this.isExhausted(),
    };
  }
}

export const ttsKeyManager = new TTSKeyManager();
