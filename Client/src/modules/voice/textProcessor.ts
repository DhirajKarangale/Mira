import type { TextChunk } from "./types";

/**
 * Unicode emoji and pictograph regex covering standard emojis,
 * emoticons, transport/maps, symbols, dingbats, and skin-tone/variation modifiers.
 */
const EMOJI_AND_SYMBOLS_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0E}\u{FE0F}]/gu;

/**
 * Cleans text for natural speech synthesis:
 * - Removes emojis, icons, and unsupported symbols.
 * - Strips raw code blocks and technical noise while keeping readable descriptions.
 * - Converts markdown markup (headers, lists, links, emphasis) to natural speech text.
 * - Preserves punctuation (periods, commas, question marks, colons, quotes) to maintain natural pronunciation.
 */
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  let text = rawText;

  // 1. Remove multi-line fenced code blocks ```...```
  text = text.replace(/```[a-zA-Z0-9_-]*\n?[\s\S]*?```/g, " ");

  // 2. Remove inline code backticks `code` -> code
  text = text.replace(/`([^`]+)`/g, "$1");

  // 3. Remove raw URLs (http:// or https://)
  text = text.replace(/https?:\/\/[^\s)]+/g, " ");

  // 4. Convert markdown links [Label](url) -> Label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 5. Convert markdown headers # Heading -> Heading.
  text = text.replace(/^#{1,6}\s+(.*)$/gm, "$1. ");

  // 6. Convert markdown blockquotes > Quote -> Quote
  text = text.replace(/^>\s+(.*)$/gm, "$1 ");

  // 7. Remove bullet points and numbered list markers
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, " ");
  text = text.replace(/^[ \t]*\d+\.[ \t]+/gm, " ");

  // 8. Remove markdown bold/italics formatting
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");

  // 9. Remove HTML tags <tag>...</tag>
  text = text.replace(/<[^>]*>/g, " ");

  // 10. Remove emojis, decorative symbols, and dingbats
  text = text.replace(EMOJI_AND_SYMBOLS_REGEX, "");

  // 11. Normalize decorative punctuation and clean unpronounceable characters
  text = text
    .replace(/[–—]/g, ", ") // Em/en-dashes to commas
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•★☆✓✔✕✖►▶◀◁]/g, " ")
    .replace(/[#@$%^*~_|[\]\\{}]/g, " "); // Strip non-speech symbols

  // 12. Normalize multiple spaces and line breaks into natural pauses
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  // 13. Ensure text ends with proper closing sentence punctuation
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text += ".";
  }

  return text;
}

/**
 * Splits text into meaningful sentences and paragraphs, respecting ElevenLabs input limits.
 * Default max chunk length is 280 characters to balance low TTFB (Time to First Byte)
 * and natural sentence cadence.
 */
export function chunkText(
  cleanText: string,
  responseId: string,
  maxChunkLength = 280
): TextChunk[] {
  if (!cleanText || !cleanText.trim()) {
    return [];
  }

  const trimmed = cleanText.trim();

  // If text is already short enough, return as a single chunk
  if (trimmed.length <= maxChunkLength) {
    return [
      {
        id: `${responseId}_chunk_0`,
        responseId,
        orderIndex: 0,
        text: trimmed,
      },
    ];
  }

  // 1. Break text into candidate sentence segments using punctuation boundaries (. ! ? ;)
  const sentencePattern = /([^.!?;\n]+[.!?;\n]+)/g;
  const rawSentences: string[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = sentencePattern.exec(trimmed)) !== null) {
    rawSentences.push(match[1].trim());
    lastIndex = sentencePattern.lastIndex;
  }

  // Pick up any trailing text
  if (lastIndex < trimmed.length) {
    const remaining = trimmed.slice(lastIndex).trim();
    if (remaining) {
      rawSentences.push(remaining);
    }
  }

  // If regex found no sentences, fallback to splitting by periods or whitespace
  if (rawSentences.length === 0) {
    rawSentences.push(trimmed);
  }

  // 2. Accumulate sentences into chunks <= maxChunkLength
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of rawSentences) {
    if (!sentence) continue;

    // If a single sentence is larger than maxChunkLength, split by clauses
    if (sentence.length > maxChunkLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      const clauses = splitOversizedSentence(sentence, maxChunkLength);
      for (const clause of clauses) {
        if (clause.trim()) {
          chunks.push(clause.trim());
        }
      }
      continue;
    }

    if (!currentChunk) {
      currentChunk = sentence;
    } else if (currentChunk.length + 1 + sentence.length <= maxChunkLength) {
      currentChunk += " " + sentence;
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 3. Assign sequential IDs and preserve exact order
  return chunks.map((chunkText, index) => ({
    id: `${responseId}_chunk_${index}`,
    responseId,
    orderIndex: index,
    text: chunkText,
  }));
}

/**
 * Splits an oversized sentence using sub-clause punctuation (commas, colons) or word boundaries.
 */
function splitOversizedSentence(sentence: string, maxLen: number): string[] {
  const parts: string[] = [];
  // Split on commas or colons first
  const clausePattern = /([^,:]+[,:]+)/g;
  const rawClauses: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = clausePattern.exec(sentence)) !== null) {
    rawClauses.push(match[1].trim());
    lastIdx = clausePattern.lastIndex;
  }

  if (lastIdx < sentence.length) {
    const tail = sentence.slice(lastIdx).trim();
    if (tail) rawClauses.push(tail);
  }

  if (rawClauses.length > 1) {
    let acc = "";
    for (const c of rawClauses) {
      if (!acc) {
        acc = c;
      } else if (acc.length + 1 + c.length <= maxLen) {
        acc += " " + c;
      } else {
        parts.push(acc.trim());
        acc = c;
      }
    }
    if (acc.trim()) parts.push(acc.trim());
    return parts;
  }

  // If no clauses or still too long, split by words
  const words = sentence.split(/\s+/);
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxLen) {
      cur += " " + w;
    } else {
      parts.push(cur.trim());
      cur = w;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  return parts;
}
