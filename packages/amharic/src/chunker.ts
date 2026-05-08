/**
 * Bilingual text chunker for the knowledge base.
 *
 * Knowledge content can be Amharic, English, or mixed. The chunker treats
 * both scripts as first-class:
 *   - Amharic sentence terminators: ። (hulet netib), ፨ (Ethiopic paragraph)
 *   - English sentence terminators: . ! ?
 *   - Plus universal: line breaks, ! ?
 *
 * Chunking strategy: greedy fill into ~targetSize-character buckets with
 * a sentence-aligned overlap between consecutive chunks. Sentence boundaries
 * are preserved — no chunk splits a sentence in half.
 */

const SENTENCE_TERMINATOR = /[።፨!?.\n]/;

/**
 * Split text into sentences across Amharic + English punctuation.
 * Preserves the terminator on the sentence it belongs to.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  for (const char of text) {
    current += char;
    if (SENTENCE_TERMINATOR.test(char)) {
      const trimmed = current.trim();
      if (trimmed.length > 0) sentences.push(trimmed);
      current = '';
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) sentences.push(trimmed);

  return sentences;
}

/**
 * @deprecated alias for splitSentences — kept for backwards compatibility.
 */
export const splitAmharicSentences = splitSentences;

export type ChunkOptions = {
  /** Target chunk size in characters. Default 800. */
  targetSize?: number;
  /** Hard cap. A chunk will never exceed this even if the next sentence
   *  fits. Default 1200. */
  maxSize?: number;
  /** Number of trailing characters to repeat at the start of the next
   *  chunk so semantic context isn't lost across chunk boundaries.
   *  Default 150. */
  overlap?: number;
};

export type Chunk = {
  text: string;
  /** 0-based index into the chunk list. */
  index: number;
  /** Character offset of the chunk's start in the original text. */
  start: number;
  /** Character offset of the chunk's end (exclusive) in the original text. */
  end: number;
};

/**
 * Chunk arbitrary text (Amharic, English, or mixed) into RAG-friendly pieces.
 *
 * Each chunk is a contiguous run of complete sentences whose joined length
 * is close to `targetSize`. Consecutive chunks share `overlap` characters
 * of trailing content from the previous chunk so retrieval can match across
 * boundaries.
 *
 * For very long sentences (no terminator within `maxSize`), we fall back to
 * a hard split on word/character boundary so we never produce a chunk
 * larger than `maxSize`.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const targetSize = options.targetSize ?? 800;
  const maxSize = options.maxSize ?? 1200;
  const overlap = options.overlap ?? 150;

  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length === 0) return [];

  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return [];

  // Build chunks by greedily appending sentences until we'd exceed targetSize.
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferStart = 0;
  let cursor = 0;

  function flush() {
    const trimmed = buffer.trim();
    if (trimmed.length === 0) return;
    chunks.push({
      text: trimmed,
      index: chunks.length,
      start: bufferStart,
      end: bufferStart + buffer.length,
    });
  }

  for (const sentence of sentences) {
    const sentenceStart = cleaned.indexOf(sentence, cursor);
    const sentenceEnd = sentenceStart + sentence.length;

    // If adding the next sentence pushes us past targetSize and the buffer
    // already has content, flush and seed the next chunk with overlap.
    if (buffer.length > 0 && buffer.length + sentence.length + 1 > targetSize) {
      flush();
      const tail = buffer.slice(Math.max(0, buffer.length - overlap));
      // Align overlap to a word boundary if possible
      const aligned = alignToBoundary(tail);
      bufferStart = bufferStart + buffer.length - aligned.length;
      buffer = aligned;
    }

    // If this single sentence is bigger than maxSize, hard-split it.
    if (sentence.length > maxSize) {
      // Flush whatever we have
      if (buffer.trim().length > 0) flush();
      const pieces = hardSplit(sentence, maxSize, overlap);
      for (const p of pieces) {
        chunks.push({
          text: p.text,
          index: chunks.length,
          start: sentenceStart + p.offset,
          end: sentenceStart + p.offset + p.text.length,
        });
      }
      buffer = '';
      bufferStart = sentenceEnd;
      cursor = sentenceEnd;
      continue;
    }

    if (buffer.length === 0) bufferStart = sentenceStart;
    buffer += (buffer.length > 0 ? ' ' : '') + sentence;
    cursor = sentenceEnd;
  }

  if (buffer.trim().length > 0) flush();

  return chunks;
}

function alignToBoundary(s: string): string {
  // Cut leading partial word so overlap starts cleanly
  const ws = s.search(/\s/);
  if (ws > 0 && ws < s.length - 1) return s.slice(ws + 1);
  return s;
}

function hardSplit(
  sentence: string,
  maxSize: number,
  overlap: number,
): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let i = 0;
  while (i < sentence.length) {
    const end = Math.min(i + maxSize, sentence.length);
    const slice = sentence.slice(i, end);
    out.push({ text: slice, offset: i });
    if (end >= sentence.length) break;
    i = end - overlap; // step back for overlap
  }
  return out;
}
