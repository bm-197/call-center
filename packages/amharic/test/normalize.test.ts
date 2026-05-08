import { describe, it, expect } from 'vitest';
import {
  normalizeAmharic,
  isAmharicText,
  detectLanguage,
} from '../src/normalize.js';

describe('normalizeAmharic', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeAmharic('  hello   world  ')).toBe('hello world');
  });

  it('collapses h-series Fidel variants to canonical ሀ', () => {
    // ሐ → ሀ, ኀ → ሀ
    expect(normalizeAmharic('ሐበሻ')).toBe('ሀበሻ');
    expect(normalizeAmharic('ኀበሻ')).toBe('ሀበሻ');
  });

  it('collapses s-series ሠ → ሰ', () => {
    expect(normalizeAmharic('ሠላም')).toBe('ሰላም');
  });

  it('collapses a-series ዐ → አ', () => {
    expect(normalizeAmharic('ዐለም')).toBe('አለም');
  });

  it('collapses ts-series ፀ → ጸ', () => {
    expect(normalizeAmharic('ፀሐይ')).toBe('ጸሀይ');
  });

  it('leaves English text alone', () => {
    expect(normalizeAmharic('Hello world')).toBe('Hello world');
  });

  it('handles mixed content without damaging either side', () => {
    expect(normalizeAmharic('Hello ሠላም world')).toBe('Hello ሰላም world');
  });
});

describe('isAmharicText', () => {
  it('detects Amharic', () => {
    expect(isAmharicText('ሰላም')).toBe(true);
  });

  it('rejects pure English', () => {
    expect(isAmharicText('Hello world')).toBe(false);
  });

  it('returns true if any Amharic char is present', () => {
    expect(isAmharicText('Hello ሰላም')).toBe(true);
  });
});

describe('detectLanguage', () => {
  it('identifies Amharic', () => {
    expect(detectLanguage('ሰላም እንዴት ነህ')).toBe('am');
  });

  it('identifies English', () => {
    expect(detectLanguage('Hello how are you')).toBe('en');
  });

  it('identifies mixed', () => {
    expect(detectLanguage('Hello ሰላም world እንዴት')).toBe('mixed');
  });

  it('treats empty/punctuation-only text as English', () => {
    expect(detectLanguage('...')).toBe('en');
    expect(detectLanguage('')).toBe('en');
  });
});
