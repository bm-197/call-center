import { describe, expect, it } from 'vitest';
import {
  callerTranscriptLanguageCode,
  liveRealtimeInputConfig,
  liveTranscriptionLanguageCodes,
} from '../src/realtime/conversation-loop.js';

describe('liveTranscriptionLanguageCodes', () => {
  it('uses Amharic for Amharic and mixed-language agents', () => {
    expect(liveTranscriptionLanguageCodes('am')).toEqual(['am']);
    expect(liveTranscriptionLanguageCodes('am+en')).toEqual(['am']);
  });

  it('uses English only for English agents', () => {
    expect(liveTranscriptionLanguageCodes('en')).toEqual(['en-US']);
  });
});

describe('liveRealtimeInputConfig', () => {
  it('keeps short pauses inside one caller turn', () => {
    expect(liveRealtimeInputConfig()).toEqual({
      automaticActivityDetection: {
        prefixPaddingMs: 300,
        silenceDurationMs: 1000,
      },
    });
  });
});

describe('callerTranscriptLanguageCode', () => {
  it('uses Google STT locale codes for the dedicated transcript stream', () => {
    expect(callerTranscriptLanguageCode('am')).toBe('am-ET');
    expect(callerTranscriptLanguageCode('am+en')).toBe('am-ET');
    expect(callerTranscriptLanguageCode('en')).toBe('en-US');
  });
});
