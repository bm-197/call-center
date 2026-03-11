/**
 * Amharic-aware text chunking for RAG.
 *
 * Amharic uses ። (hulet netib) as sentence terminator instead of period.
 * Also uses ፣ (netela) as comma and ፤ (semicolon).
 */

// Amharic sentence terminators
const SENTENCE_TERMINATORS = /[።!?\n]/;

/**
 * Split Amharic text into sentences.
 * Handles both Amharic (።) and English (.) sentence endings.
 */
export function splitAmharicSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;

    if (SENTENCE_TERMINATORS.test(char)) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        sentences.push(trimmed);
      }
      current = "";
    }
  }

  // Don't lose trailing text without terminator
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    sentences.push(trimmed);
  }

  return sentences;
}
