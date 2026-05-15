import { describe, expect, it } from 'vitest';
import { liveTranscriptionLanguageCodes } from '../src/realtime/conversation-loop.js';

describe('liveTranscriptionLanguageCodes', () => {
  it('uses Amharic for Amharic and mixed-language agents', () => {
    expect(liveTranscriptionLanguageCodes('am')).toEqual(['am-ET']);
    expect(liveTranscriptionLanguageCodes('am+en')).toEqual(['am-ET']);
  });

  it('uses English only for English agents', () => {
    expect(liveTranscriptionLanguageCodes('en')).toEqual(['en-US']);
  });
});
