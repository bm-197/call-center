/**
 * Amharic text normalization for consistent retrieval and matching.
 *
 * Fidel (ፊደል) has many homophonic variants — characters that sound the
 * same but have different code points (historical / Ge'ez origins). For
 * search, embeddings, and equality checks we collapse them to a canonical
 * form. Display text should keep the original.
 */

const AMHARIC_RANGE = /[ሀ-፿]/;
const ENGLISH_LETTER = /[A-Za-z]/;

// Homophonic Fidel collapses. Keys are variant forms; values are the
// canonical form we keep. Sourced from common Amharic NLP normalization
// tables (HornMorpho, Amharic-Stemmer, etc.).
//
// We collapse the four "h" series to ሀ family, the two "s" series to ሰ,
// the two "a" series to አ, and the two "ts" series to ጸ.
const FIDEL_NORMALIZATIONS: Record<string, string> = {
  // h-series: ሐ ኀ → ሀ
  ሐ: 'ሀ',
  ሑ: 'ሁ',
  ሒ: 'ሂ',
  ሓ: 'ሃ',
  ሔ: 'ሄ',
  ሕ: 'ህ',
  ሖ: 'ሆ',
  ኀ: 'ሀ',
  ኁ: 'ሁ',
  ኂ: 'ሂ',
  ኃ: 'ሃ',
  ኄ: 'ሄ',
  ኅ: 'ህ',
  ኆ: 'ሆ',
  // s-series: ሠ → ሰ
  ሠ: 'ሰ',
  ሡ: 'ሱ',
  ሢ: 'ሲ',
  ሣ: 'ሳ',
  ሤ: 'ሴ',
  ሥ: 'ስ',
  ሦ: 'ሶ',
  // a-series: ዐ → አ
  ዐ: 'አ',
  ዑ: 'ኡ',
  ዒ: 'ኢ',
  ዓ: 'አ',
  ዔ: 'ኤ',
  ዕ: 'እ',
  ዖ: 'ኦ',
  // ts-series: ፀ → ጸ
  ፀ: 'ጸ',
  ፁ: 'ጹ',
  ፂ: 'ጺ',
  ፃ: 'ጻ',
  ፄ: 'ጼ',
  ፅ: 'ጽ',
  ፆ: 'ጾ',
};

/**
 * Normalize Amharic text for consistent processing.
 *
 * - Trims and collapses whitespace
 * - Replaces homophonic Fidel variants with their canonical form
 * - Leaves Latin / digits / punctuation untouched (we keep mixed text intact)
 *
 * Use this before embedding, indexing, or equality comparison. Don't use
 * it on text you'll display to users — original spelling matters there.
 */
export function normalizeAmharic(text: string): string {
  let out = text.trim().replace(/\s+/g, ' ');
  out = out.replace(/[ሀ-፿]/g, (ch) => FIDEL_NORMALIZATIONS[ch] ?? ch);
  return out;
}

/**
 * Check if a string contains Amharic (Ethiopic) characters.
 */
export function isAmharicText(text: string): boolean {
  return AMHARIC_RANGE.test(text);
}

/**
 * Detect the primary language of the text by letter-character ratios.
 * Whitespace, digits, and punctuation are excluded from the count.
 */
export function detectLanguage(text: string): 'am' | 'en' | 'mixed' {
  const letters = [...text].filter(
    (c) => AMHARIC_RANGE.test(c) || ENGLISH_LETTER.test(c),
  );
  if (letters.length === 0) return 'en';

  const amharicCount = letters.filter((c) => AMHARIC_RANGE.test(c)).length;
  const ratio = amharicCount / letters.length;

  if (ratio > 0.7) return 'am';
  if (ratio < 0.1) return 'en';
  return 'mixed';
}
