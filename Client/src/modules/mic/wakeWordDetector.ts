/**
 * WakeWordDetector: Detects configured wake words (default "Mira", with phonetic variations like "Myra", "Meera")
 * in transcribed text. Ignores unrelated speech before the wake word is detected.
 * Once activated, starts command collection and extracts subsequent command segments.
 * Handles repeated wake words, partial transcriptions, and punctuation gracefully.
 */

import type { WakeWordDetectionResult, WakeWordOptions } from "./types";

// Comprehensive phonetic and acoustic variants for "Mira" produced by STT engines (Google Speech, Whisper, Scribe):
export const DEFAULT_WAKE_WORDS = [
  "mira",
  "mirror",
  "myra",
  "meera",
  "mera",
  "mirra",
  "miira",
  "miera",
  "mirah",
  "meira",
  "mayra",
  "amira",
  "ameera",
  "neera",
  "nira",
  "mila",
  "mita",
  "mida",
];

export class WakeWordDetector {
  private wakeWords: string[];
  private isCollecting = false;
  private detectedWakeWord: string | null = null;
  private lastDetectedAt = 0;

  constructor(options?: WakeWordOptions) {
    this.wakeWords = options?.wakeWords?.length
      ? options.wakeWords.map((w) => w.trim().toLowerCase())
      : [...DEFAULT_WAKE_WORDS];
  }

  public getWakeWords(): string[] {
    return [...this.wakeWords];
  }

  public addWakeWord(word: string): void {
    const clean = word.trim().toLowerCase();
    if (clean && !this.wakeWords.includes(clean)) {
      this.wakeWords.push(clean);
    }
  }

  public removeWakeWord(word: string): void {
    const clean = word.trim().toLowerCase();
    this.wakeWords = this.wakeWords.filter((w) => w !== clean);
    if (this.wakeWords.length === 0) {
      this.wakeWords = [...DEFAULT_WAKE_WORDS];
    }
  }

  public setWakeWords(words: string[]): void {
    const cleaned = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
    this.wakeWords = cleaned.length ? cleaned : [...DEFAULT_WAKE_WORDS];
  }

  public getIsCollecting(): boolean {
    return this.isCollecting;
  }

  public getLastDetectedAt(): number {
    return this.lastDetectedAt;
  }

  /**
   * Resets the detector state to wait for the next wake word.
   */
  public reset(): void {
    this.isCollecting = false;
    this.detectedWakeWord = null;
  }

  /**
   * Evaluates a transcription segment:
   * - If not yet activated, scans for the configured wake word.
   *   If not found, ignores the speech completely.
   *   If found, triggers activation and extracts text following the wake word.
   * - If already activated, collects speech, stripping any repeated wake words.
   */
  public processTranscription(rawText: string): WakeWordDetectionResult {
    const trimmed = (rawText || "")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!trimmed) {
      return {
        detected: false,
        isNewActivation: false,
        rawText,
      };
    }

    if (!this.isCollecting) {
      // Build regex pattern matching any configured wake word with word boundaries
      // Also matches optional conversational greeting prefixes like "hey mira", "hi mira", "hello mira", "ok mira"
      const pattern = new RegExp(
        `(?:\\b(?:hey|hi|hello|ok|okay)\\s+)?\\b(${this.wakeWords.map(escapeRegExp).join("|")})\\b`,
        "i"
      );

      const match = pattern.exec(trimmed);

      if (!match) {
        // Before detecting the wake word, ignore unrelated speech
        console.log(`[WakeWordDetector] Speech ignored (waiting for 'Mira'): "${trimmed}"`);
        return {
          detected: false,
          isNewActivation: false,
          rawText,
        };
      }

      // Wake word detected!
      const matchedWord = match[1];
      this.isCollecting = true;
      this.detectedWakeWord = matchedWord;
      this.lastDetectedAt = Date.now();

      // Extract command portion that follows the wake word in this segment
      // Also handle repeated wake words e.g. "Mira, Mira, what is Python?"
      let commandPart = trimmed.substring(match.index + match[0].length).trim();

      // Clean leading punctuation, whitespace, or repeated wake words
      commandPart = this.stripLeadingWakeWordsAndPunctuation(commandPart);

      console.log(
        `[WakeWordDetector] Wake word "${matchedWord}" detected! Command collection started. Initial command segment: "${commandPart}"`
      );

      return {
        detected: true,
        isNewActivation: true,
        wakeWord: matchedWord,
        commandPart,
        rawText,
      };
    }

    // Already in COLLECTING_COMMAND state
    // Handle repeated wake words if user spoke "Mira" again at the start of a subsequent segment
    const commandPart = this.stripLeadingWakeWordsAndPunctuation(trimmed);

    return {
      detected: true,
      isNewActivation: false,
      wakeWord: this.detectedWakeWord || this.wakeWords[0],
      commandPart,
      rawText,
    };
  }

  /**
   * Removes any leading wake words (handling repeated wake words) and separator punctuation.
   */
  private stripLeadingWakeWordsAndPunctuation(text: string): string {
    let result = text.trim();
    let changed = true;

    while (changed) {
      changed = false;

      // 1. Strip leading punctuation: commas, periods, colons, dashes, question marks
      const strippedPunct = result.replace(/^[,.:;!?-]+\s*/, "").trim();
      if (strippedPunct !== result) {
        result = strippedPunct;
        changed = true;
      }

      // 2. Strip leading conversational greetings: "hey", "hi", "hello", "ok", "okay"
      const strippedGreeting = result.replace(/^(?:hey|hi|hello|ok|okay)\s+/i, "").trim();
      if (strippedGreeting !== result) {
        result = strippedGreeting;
        changed = true;
      }

      // 3. Strip any leading wake word
      for (const w of this.wakeWords) {
        const regex = new RegExp(`^${escapeRegExp(w)}\\b`, "i");
        if (regex.test(result)) {
          result = result.replace(regex, "").trim();
          changed = true;
        }
      }
    }

    return result;
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const wakeWordDetector = new WakeWordDetector();
