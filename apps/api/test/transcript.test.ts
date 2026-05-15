import { describe, expect, it } from 'vitest';
import {
  toStoredTranscript,
  transcriptNeedsAmharicRepair,
} from '../src/realtime/transcript.js';

describe('toStoredTranscript', () => {
  it('maps live model roles to call transcript speakers', () => {
    const at = new Date('2026-05-15T08:00:00.000Z');

    expect(
      toStoredTranscript([
        { role: 'user', content: 'caller text', at },
        { role: 'assistant', content: 'agent text', at },
      ]),
    ).toEqual([
      {
        speaker: 'caller',
        text: 'caller text',
        timestamp: '2026-05-15T08:00:00.000Z',
      },
      {
        speaker: 'agent',
        text: 'agent text',
        timestamp: '2026-05-15T08:00:00.000Z',
      },
    ]);
  });

  it('repairs only caller turns that are not already Amharic', () => {
    expect(
      transcriptNeedsAmharicRepair([
        {
          speaker: 'caller',
          text: 'hello',
          timestamp: '2026-05-15T08:00:00.000Z',
        },
      ]),
    ).toBe(true);

    expect(
      transcriptNeedsAmharicRepair([
        {
          speaker: 'caller',
          text: 'ሰላም',
          timestamp: '2026-05-15T08:00:00.000Z',
        },
        {
          speaker: 'agent',
          text: 'agent English is not repaired',
          timestamp: '2026-05-15T08:00:00.000Z',
        },
      ]),
    ).toBe(false);
  });
});
