import { describe, it, expect } from 'vitest';
import { chunkText, splitSentences } from '../src/chunker.js';

describe('splitSentences', () => {
  it('splits Amharic on ።', () => {
    const result = splitSentences('ሰላም። እንዴት ነህ።');
    expect(result).toEqual(['ሰላም።', 'እንዴት ነህ።']);
  });

  it('splits English on .', () => {
    const result = splitSentences('Hello world. How are you?');
    expect(result).toEqual(['Hello world.', 'How are you?']);
  });

  it('splits mixed text on either terminator', () => {
    const result = splitSentences('Hello. ሰላም። How? እንዴት።');
    expect(result).toEqual(['Hello.', 'ሰላም።', 'How?', 'እንዴት።']);
  });

  it('preserves trailing text without terminator', () => {
    const result = splitSentences('Hello world');
    expect(result).toEqual(['Hello world']);
  });

  it('returns empty for empty input', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

describe('chunkText', () => {
  it('returns empty for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('packs short sentences into a single chunk', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, { targetSize: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('First');
    expect(chunks[0].text).toContain('Third');
    expect(chunks[0].index).toBe(0);
  });

  it('creates multiple chunks when content exceeds targetSize', () => {
    const sentence = 'This is a moderately long sentence. ';
    const text = sentence.repeat(20);
    const chunks = chunkText(text, {
      targetSize: 200,
      maxSize: 400,
      overlap: 30,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(400);
    }
  });

  it('ends every chunk on a sentence terminator', () => {
    // Chunks may START mid-sentence (overlap seeds the next chunk with
    // tail content for retrieval continuity), but they must always END
    // on a complete sentence — no truncation at the right edge.
    const text =
      'Alpha sentence one. Beta sentence two. Gamma sentence three. Delta sentence four.';
    const chunks = chunkText(text, {
      targetSize: 30,
      maxSize: 100,
      overlap: 10,
    });
    for (const c of chunks) {
      expect(/[.!?]\s*$/.test(c.text)).toBe(true);
    }
  });

  it('chunks Amharic correctly', () => {
    const sentence = 'ይህ ረዘም ያለ ዐረፍተ ነገር ነው። ';
    const text = sentence.repeat(10);
    const chunks = chunkText(text, {
      targetSize: 100,
      maxSize: 200,
      overlap: 30,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.endsWith('።')).toBe(true);
    }
  });

  it('hard-splits a single sentence longer than maxSize', () => {
    const huge = 'x'.repeat(2000);
    const chunks = chunkText(huge, {
      targetSize: 500,
      maxSize: 800,
      overlap: 50,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(800);
    }
  });

  it('assigns sequential indices and positive offsets', () => {
    const sentence = 'Sample sentence here. ';
    const text = sentence.repeat(15);
    const chunks = chunkText(text, {
      targetSize: 100,
      maxSize: 200,
      overlap: 20,
    });
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.start).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeGreaterThan(c.start);
    });
  });

  it('works on mixed Amharic + English content', () => {
    const text =
      'Welcome to our service. እንኳን ደህና መጡ። How can I help you? እንዴት ልረዳዎት እችላለሁ።';
    const chunks = chunkText(text, {
      targetSize: 50,
      maxSize: 100,
      overlap: 10,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('Welcome');
    expect(joined).toContain('እንኳን');
  });
});
