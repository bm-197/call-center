import { describe, expect, it } from 'vitest';
import {
  geminiPcm16Base64ToMulaw8k,
  mulaw8kToGeminiPcm16Base64,
  parsePcmRate,
  resamplePcm16,
} from '../src/realtime/live-audio-codec.js';

describe('live audio codec', () => {
  it('upsamples 8 kHz phone audio to 16 kHz Gemini PCM', () => {
    const silenceMulaw = Buffer.alloc(160, 0xff);
    const base64 = mulaw8kToGeminiPcm16Base64(silenceMulaw);
    const pcm = Buffer.from(base64, 'base64');

    expect(pcm.length).toBe(640);
  });

  it('downsamples 24 kHz Gemini PCM to 8 kHz phone audio', () => {
    const pcm = Buffer.alloc(960);
    const mulaw = geminiPcm16Base64ToMulaw8k(pcm.toString('base64'), 24_000);

    expect(mulaw.length).toBe(160);
  });

  it('resamples PCM while preserving duration', () => {
    const input = new Int16Array(240);
    const output = resamplePcm16(input, 24_000, 8_000);

    expect(output.length).toBe(80);
  });

  it('parses PCM sample rate from mime type', () => {
    expect(parsePcmRate('audio/pcm;rate=16000')).toBe(16_000);
    expect(parsePcmRate(undefined)).toBe(24_000);
  });
});
