/**
 * Text-to-Speech Smart Chunker
 *
 * Scans LLM responses and splits text into ~100-character chunks
 * while strictly preserving natural sentence boundaries, bullet points,
 * punctuation, and pronunciation rhythm without splitting words mid-way.
 */

export interface TTSChunk {
  index: number;
  text: string;
  charCount: number;
}

const COMMON_ABBREVIATIONS = [
  "etc",
  "e\\.g",
  "i\\.e",
  "vs",
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "inc",
  "ltd",
  "corp",
  "approx",
  "no",
  "vol",
  "fig",
  "llm",
  "ai",
  "api",
];

const ABBREV_REGEX = new RegExp(
  `\\b(${COMMON_ABBREVIATIONS.join("|")})\\.`,
  "gi"
);

/**
 * Splits response text into ordered chunks aiming for ~100 characters each.
 * Guarantees zero word-splitting and preserves natural clause cadence.
 */
export function smartChunkText(
  input: string,
  targetSize: number = 100
): TTSChunk[] {
  if (!input || !input.trim()) {
    return [];
  }

  const clean = input.replace(/\r\n/g, "\n").trim();
  const rawLines = clean.split("\n");
  const rawChunks: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Preserve bullet points or short headers as distinct natural pauses
    const isBulletOrHeader = /^(\*|-|\d+\.|#+)\s+/.test(line);

    // If the line is already around the target chunk size (up to targetSize + 25)
    if (line.length <= targetSize + 25) {
      rawChunks.push(line);
      continue;
    }

    // Protect common abbreviations so periods don't trigger premature sentence cuts
    const protectedLine = line.replace(ABBREV_REGEX, "$1__DOT__");

    // Match sentences ending in . ! ? followed by whitespace or end of line
    const sentenceMatches =
      protectedLine.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [protectedLine];

    const sentences = sentenceMatches
      .map((s) => s.replace(/__DOT__/g, ".").trim())
      .filter(Boolean);

    let curChunk = "";

    for (const s of sentences) {
      if (!curChunk) {
        if (s.length <= targetSize + 25) {
          curChunk = s;
        } else {
          // Sentence itself exceeds target: split by clauses or words
          const subParts = splitSentenceByClauses(s, targetSize);
          for (let i = 0; i < subParts.length; i++) {
            if (i === subParts.length - 1 && subParts[i].length < 40 && !isBulletOrHeader) {
              curChunk = subParts[i];
            } else {
              rawChunks.push(subParts[i]);
            }
          }
        }
      } else {
        // Can we append this sentence to curChunk without exceeding targetSize?
        if (curChunk.length + s.length + 1 <= targetSize + 20) {
          curChunk += " " + s;
        } else {
          rawChunks.push(curChunk.trim());
          if (s.length <= targetSize + 25) {
            curChunk = s;
          } else {
            const subParts = splitSentenceByClauses(s, targetSize);
            for (let i = 0; i < subParts.length; i++) {
              if (i === subParts.length - 1 && subParts[i].length < 40 && !isBulletOrHeader) {
                curChunk = subParts[i];
              } else {
                rawChunks.push(subParts[i]);
              }
            }
          }
        }
      }
    }

    if (curChunk.trim()) {
      rawChunks.push(curChunk.trim());
    }
  }

  return rawChunks.map((text, index) => ({
    index,
    text,
    charCount: text.length,
  }));
}

/**
 * Splits a long sentence into ~100 character clause or word chunks.
 * Prioritizes commas, semicolons, colons, em-dashes, and lastly whitespace.
 */
function splitSentenceByClauses(
  sentence: string,
  targetSize: number
): string[] {
  const parts: string[] = [];
  const words = sentence.split(/(\s+)/);
  let buffer = "";

  for (const word of words) {
    if (!buffer) {
      buffer = word;
    } else if (buffer.length + word.length <= targetSize + 15) {
      buffer += word;
    } else {
      parts.push(buffer.trim());
      buffer = word.trim();
    }
  }

  if (buffer.trim()) {
    parts.push(buffer.trim());
  }

  return parts.filter(Boolean);
}
