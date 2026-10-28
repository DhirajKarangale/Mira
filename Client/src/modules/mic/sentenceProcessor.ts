/**
 * SentenceProcessor: Assembles transcription segments into a complete command.
 * - Monitors the 5-second silence period to determine completion.
 * - Ignores standalone greetings (e.g. "Hi", "Hello", "Hey").
 * - Filters out incomplete fragments containing only two or three words (e.g. "and then", "so um", "it is").
 * - Accepts valid requests even if short (e.g. "Help me", "Stop", "Who are you?", "Hi, tell me about Python").
 * - Preserves complete intended commands, capitalization, and punctuation.
 */

import type { SentenceValidationResult, SentenceProcessorOptions } from "./types";

export const DEFAULT_SILENCE_THRESHOLD_MS = 1800; // 1.8-second natural conversational pause

const STOP_PATTERNS = [
  /\bstop\b/i,
  /\bquiet\b/i,
  /\bquite\b/i, // common homophone / mis-transcription of quiet
  /\bmute\b/i,
  /\bshut\s*up\b/i,
  /\bbe\s+quiet\b/i,
  /\bsilence\b/i,
  /\bshush\b/i,
  /\bhush\b/i,
  /\bhalt\b/i,
  /\bpause\b/i,
  /\bcancel\b/i,
  /\benough\b/i,
  /\bstop\s+talking\b/i,
  /\bstop\s+speaking\b/i,
  /\bstop\s+reading\b/i,
  /\bstop\s+it\b/i,
  /\bdon'?t\s+talk\b/i,
];

const QUESTION_STARTERS = new Set([
  "what",
  "whats",
  "what's",
  "where",
  "wheres",
  "where's",
  "how",
  "hows",
  "how's",
  "why",
  "who",
  "which",
]);

/**
 * Checks whether spoken text is an interrupt command to stop active voice playback.
 * Matches phrases like "stop", "quiet", "quite", "mute", "Mira stop", "please stop", "shut up", "be quiet", etc.
 * When isVoicePlaying is true, ANY speech containing a stop/mute/quiet keyword is treated as an immediate interrupt.
 */
export function isVoiceStopCommand(text: string, isVoicePlaying = false): boolean {
  if (!text) return false;
  const clean = text
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return false;

  // Check if any stop keyword / pattern matches
  const hasStopMatch = STOP_PATTERNS.some((pattern) => pattern.test(clean));
  if (!hasStopMatch) return false;

  // If voice is currently playing or queued, ANY match is immediately treated as interrupt!
  if (isVoicePlaying) {
    return true;
  }

  // If idle / not playing, ensure it's a short command (<= 5 words) and not a question like "where is the bus stop"
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (words.length > 0 && QUESTION_STARTERS.has(words[0])) return false;

  return true;
}

const STANDALONE_GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "good day",
  "greetings",
  "howdy",
  "sup",
  "yo",
  "hey there",
  "hi there",
  "hello there",
  "mira hi",
  "mira hello",
  "mira hey",
]);

// Inherently interrogative words (wh- words) that indicate query intent anywhere in short phrases
const WH_QUESTION_WORDS = new Set([
  "what",
  "whats",
  "what's",
  "who",
  "whos",
  "who's",
  "whom",
  "whose",
  "where",
  "wheres",
  "where's",
  "when",
  "whens",
  "when's",
  "why",
  "whys",
  "why's",
  "how",
  "hows",
  "how's",
  "which",
]);

// Auxiliary verbs that indicate an inverted interrogative or command only when leading the phrase
const LEADING_AUXILIARIES = new Set([
  "can",
  "could",
  "would",
  "will",
  "shall",
  "should",
  "is",
  "are",
  "does",
  "do",
  "did",
  "has",
  "have",
  "had",
  "am",
]);

// Action verbs that indicate a valid command even in very short phrases
const ACTION_VERBS = new Set([
  "tell",
  "help",
  "open",
  "close",
  "show",
  "find",
  "search",
  "play",
  "stop",
  "pause",
  "resume",
  "start",
  "create",
  "write",
  "generate",
  "read",
  "summarize",
  "explain",
  "describe",
  "calculate",
  "define",
  "translate",
  "send",
  "clear",
  "delete",
  "check",
  "update",
  "run",
  "give",
  "make",
  "turn",
  "set",
  "browse",
  "speak",
  "repeat",
  "listen",
  "cancel",
  "quit",
  "exit",
  "remind",
]);

export class SentenceProcessor {
  private segments: string[] = [];
  private options: Required<SentenceProcessorOptions>;

  constructor(options?: SentenceProcessorOptions) {
    this.options = {
      silenceThresholdMs: options?.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS,
      fragmentMaxWords: options?.fragmentMaxWords ?? 3,
    };
  }

  public getSegments(): string[] {
    return [...this.segments];
  }

  public getSegmentCount(): number {
    return this.segments.length;
  }

  public hasContent(): boolean {
    return this.segments.length > 0 && this.getRawText().trim().length > 0;
  }

  private cleanTokenString(s: string): string {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Adds a new transcription segment to the aggregated command text.
   * Handles deduplication, progressive prefix replacement, and smooth joins across partial segments.
   */
  public addSegment(segmentText: string): void {
    const trimmed = (segmentText || "").trim();
    if (!trimmed) return;

    const trimmedNorm = this.cleanTokenString(trimmed);
    if (!trimmedNorm) return;

    if (this.segments.length > 0) {
      const lastIndex = this.segments.length - 1;
      const last = this.segments[lastIndex];
      const lastNorm = this.cleanTokenString(last);

      // 1. Identical segment (normalized): skip duplicate
      if (lastNorm === trimmedNorm) {
        return;
      }

      // 2. Entire command extension: if new segment begins with all accumulated text,
      // it is a revised full transcript from the engine (e.g. streaming update). Replace everything!
      const currentRawNorm = this.cleanTokenString(this.getRawText());
      if (currentRawNorm && trimmedNorm.startsWith(currentRawNorm)) {
        this.segments = [trimmed];
        return;
      }

      // 3. Extension / superstring of last segment:
      // E.g., last was "can you tell me" and new is "can you tell me who is the CEO of Google"
      // Replace last with the full new segment instead of appending duplicates!
      if (lastNorm && trimmedNorm.startsWith(lastNorm)) {
        this.segments[lastIndex] = trimmed;
        return;
      }

      // 4. Substring of last segment or accumulated text:
      // E.g., last was "can you tell me who is the CEO of Google" and new is "CEO of Google"
      if (currentRawNorm && currentRawNorm.includes(trimmedNorm)) {
        return;
      }

      // 5. Overlap check across full length
      const lastWords = last.split(/\s+/);
      const newWords = trimmed.split(/\s+/);
      const overlapLen = this.findOverlapWords(lastWords, newWords);
      if (overlapLen > 0) {
        const nonOverlapping = newWords.slice(overlapLen).join(" ");
        if (nonOverlapping.trim()) {
          this.segments.push(nonOverlapping.trim());
        }
        return;
      }
    }

    this.segments.push(trimmed);
  }

  /**
   * Checks whether the silence duration meets or exceeds the 5-second silence threshold.
   */
  public isSilenceTriggered(silenceDurationMs: number): boolean {
    return silenceDurationMs >= this.options.silenceThresholdMs;
  }

  /**
   * Returns assembled raw text from all collected segments.
   */
  public getRawText(): string {
    if (this.segments.length === 0) return "";
    return this.segments.join(" ").replace(/\s+([.,;:!?])/g, "$1").trim();
  }

  /**
   * Evaluates, filters, and formats the collected segments into a complete command:
   * - Ignores standalone greetings ("Hi", "Hello")
   * - Ignores incomplete 2-3 word fragments ("and then", "so um", "it is")
   * - Preserves short valid requests ("Help me", "Stop", "Who are you?")
   * - Preserves greetings with commands ("Hi, tell me about Python")
   * - Preserves punctuation and capitalization
   */
  public validateAndFormatCommand(overrideText?: string): SentenceValidationResult {
    const rawText = (overrideText !== undefined ? overrideText : this.getRawText())
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!rawText) {
      return {
        isValid: false,
        command: "",
        rawText,
        wordCount: 0,
        reason: "empty",
      };
    }

    const words = rawText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // 0. Strictly consider language as English only
    // Reject text that contains characters outside standard English alphabet, digits, and common punctuation
    if (/[^\x00-\x7F\u2018\u2019\u201C\u201D]/.test(rawText)) {
      console.log(
        `[SentenceProcessor] Non-English text rejected as per English-only specification: "${rawText}"`
      );
      return {
        isValid: false,
        command: "",
        rawText,
        wordCount,
        reason: "non_english",
      };
    }

    // 1. Check for standalone greeting: e.g. "Hi", "Hello", "Hey", "Good morning"
    const normalizedNoPunct = rawText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (STANDALONE_GREETINGS.has(normalizedNoPunct)) {
      console.log(
        `[SentenceProcessor] Standalone greeting "${rawText}" ignored as per specification.`
      );
      return {
        isValid: false,
        command: "",
        rawText,
        wordCount,
        reason: "standalone_greeting",
      };
    }

    // 2. Check for incomplete fragments of two or three words
    // If words <= 3, ensure it has query or action intent
    if (wordCount <= this.options.fragmentMaxWords) {
      const hasIntent = this.hasCommandOrQueryIntent(words, rawText);
      if (!hasIntent) {
        console.log(
          `[SentenceProcessor] Incomplete fragment "${rawText}" (${wordCount} words) ignored.`
        );
        return {
          isValid: false,
          command: "",
          rawText,
          wordCount,
          reason: "incomplete_fragment",
        };
      }
    }

    // 3. Format valid command: preserve original casing & punctuation, capitalize first letter
    const formatted = this.formatSentence(rawText);

    return {
      isValid: true,
      command: formatted,
      rawText,
      wordCount,
      reason: "valid_command",
    };
  }

  /**
   * Resets all collected segments and state.
   */
  public clear(): void {
    this.segments = [];
  }

  /**
   * Determines if a short 1-3 word phrase contains valid request/command intent:
   * A: Ends with question mark (?)
   * B: Contains inherently interrogative wh- word ("what", "who", "why", "how", etc.)
   * C: Starts with an interrogative/imperative auxiliary ("can", "could", "is", "do", etc.)
   * D: Contains any action verb ("help", "stop", "open", "show", "tell", etc.)
   */
  private hasCommandOrQueryIntent(words: string[], fullText: string): boolean {
    // A: Explicit question mark
    if (fullText.trim().endsWith("?")) {
      return true;
    }

    // Cleaned tokens (lowercase, letters only)
    const tokens = words.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
    if (tokens.length === 0) return false;

    // B: Contains any wh- question word (e.g. "what", "who", "why", "how")
    for (const token of tokens) {
      if (WH_QUESTION_WORDS.has(token)) {
        return true;
      }
    }

    // C: Starts with an auxiliary verb (e.g. "Can you?", "Is it ready?", "Do this")
    if (LEADING_AUXILIARIES.has(tokens[0])) {
      return true;
    }

    // D: Contains any action verb (e.g. "help", "stop", "open", "show", "tell")
    for (const token of tokens) {
      if (ACTION_VERBS.has(token)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Formats sentence: ensures first letter is capitalized, preserves punctuation,
   * collapses repeated phrases, and appends appropriate terminal punctuation if absent.
   */
  private formatSentence(text: string): string {
    let clean = text.trim();
    if (!clean) return "";

    // Deduplicate repeated identical phrases (e.g. "can you tell me can you tell me")
    clean = this.deduplicateRepeatedPhrases(clean);

    // Capitalize first character
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);

    // If text already has trailing punctuation, preserve it as-is
    if (/[.!?]$/.test(clean)) {
      return clean;
    }

    // If starts with interrogative indicator or sounds like a question, append '?'
    const firstWord = clean.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
    if (WH_QUESTION_WORDS.has(firstWord) || LEADING_AUXILIARIES.has(firstWord)) {
      return `${clean}?`;
    }

    // Otherwise, append '.'
    return `${clean}.`;
  }

  /**
   * Automatically collapses stuttered or repeated phrases in transcription output.
   * e.g. "can you tell me can you tell me who is" -> "can you tell me who is"
   */
  private deduplicateRepeatedPhrases(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return text;

    const resultWords = [...words];
    let changed = true;
    let passes = 0;

    while (changed && passes < 10) {
      changed = false;
      passes++;
      const n = resultWords.length;
      for (let phraseLen = Math.floor(n / 2); phraseLen >= 1; phraseLen--) {
        for (let i = 0; i <= n - 2 * phraseLen; i++) {
          const phrase1 = resultWords
            .slice(i, i + phraseLen)
            .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
            .join(" ");
          const phrase2 = resultWords
            .slice(i + phraseLen, i + 2 * phraseLen)
            .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
            .join(" ");

          if (phrase1 && phrase1 === phrase2) {
            resultWords.splice(i + phraseLen, phraseLen);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }

    return resultWords.join(" ");
  }

  /**
   * Finds word overlap between two consecutive word arrays to prevent stuttering.
   */
  private findOverlapWords(prevWords: string[], nextWords: string[]): number {
    const maxOverlap = Math.min(prevWords.length, nextWords.length);
    for (let len = maxOverlap; len >= 1; len--) {
      const prevSlice = prevWords.slice(-len).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const nextSlice = nextWords.slice(0, len).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (prevSlice.join(" ") === nextSlice.join(" ")) {
        return len;
      }
    }
    return 0;
  }
}

export const sentenceProcessor = new SentenceProcessor();

