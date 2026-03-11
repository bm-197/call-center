/**
 * Amharic text normalization utilities.
 *
 * Handles common Fidel (ፊደል) script variations and normalizations
 * needed for consistent text processing.
 */

// Amharic Unicode range: U+1200 to U+137F (Ethiopic block)
const AMHARIC_RANGE = /[\u1200-\u137F]/;

// Common character normalizations (variant forms → canonical)
const NORMALIZATIONS: Record<string, string> = {
  "\u1205": "\u1205", // ህ
  "\u1285": "\u1205", // ኅ → ህ (normalize variant)
  "\u1245": "\u1245", // ቅ
  "\u12D5": "\u12D5", // እ
};

/**
 * Normalize Amharic text for consistent processing.
 * - Removes excessive whitespace
 * - Normalizes variant Fidel characters
 * - Trims
 */
export function normalizeAmharic(text: string): string {
  let normalized = text.trim();

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ");

  // Apply character normalizations
  for (const [from, to] of Object.entries(NORMALIZATIONS)) {
    normalized = normalized.replaceAll(from, to);
  }

  return normalized;
}

/**
 * Check if a string contains Amharic (Ethiopic) characters.
 */
export function isAmharicText(text: string): boolean {
  return AMHARIC_RANGE.test(text);
}

/**
 * Detect the primary language of the text.
 * Simple heuristic based on character ranges.
 */
export function detectLanguage(text: string): "am" | "en" | "mixed" {
  const chars = [...text.replace(/\s/g, "")];
  if (chars.length === 0) return "en";

  const amharicCount = chars.filter((c) => AMHARIC_RANGE.test(c)).length;
  const ratio = amharicCount / chars.length;

  if (ratio > 0.7) return "am";
  if (ratio < 0.1) return "en";
  return "mixed";
}
