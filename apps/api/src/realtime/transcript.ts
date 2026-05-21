import { GoogleGenAI } from '@google/genai';
import { isAmharicText } from '@call-center/amharic';

export type ConversationTranscriptTurn = {
  role: 'user' | 'assistant';
  content: string;
  at: Date;
};

export type StoredTranscriptTurn = {
  speaker: 'caller' | 'agent';
  text: string;
  timestamp: string;
};

const TRANSCRIPT_REPAIR_MODEL =
  process.env.GEMINI_TRANSCRIPT_REPAIR_MODEL ?? 'gemini-2.5-flash';

export function toStoredTranscript(
  turns: ConversationTranscriptTurn[],
): StoredTranscriptTurn[] {
  return turns.map((turn) => ({
    speaker: turn.role === 'user' ? 'caller' : 'agent',
    text: turn.content,
    timestamp: turn.at.toISOString(),
  }));
}

export async function ensureCallerTranscriptAmharic(
  turns: StoredTranscriptTurn[],
  agentLanguage: string,
): Promise<StoredTranscriptTurn[]> {
  if (agentLanguage.startsWith('en') || !transcriptNeedsAmharicRepair(turns)) {
    return turns;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return turns;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const callerTurns = turns
      .map((turn, index) => ({ turn, index }))
      .filter(({ turn }) => turn.speaker === 'caller' && turn.text.trim());
    const response = await ai.models.generateContent({
      model: TRANSCRIPT_REPAIR_MODEL,
      contents:
        'You are fixing saved call-center transcripts for Amharic callers. ' +
        'The speech recognizer may have written Amharic speech as English, Hindi, Chinese, Arabic, or another script. ' +
        'Return natural Amharic in Ethiopic script for each caller turn. Keep numbers, names, prices, dates, and phone numbers unchanged. ' +
        'If a caller turn is already good Amharic, keep it. If a turn is truly unintelligible, keep the original text. ' +
        'Return strict JSON only: [{"index": number, "text": string}]. The index must match the original index.\n\n' +
        JSON.stringify(
          callerTurns.map(({ turn, index }) => ({
            index,
            text: turn.text,
          })),
        ),
    });

    const repaired = parseTranscriptRepair(response.text ?? '');
    if (repaired.size === 0) return turns;

    return turns.map((turn, index) => {
      if (turn.speaker !== 'caller') return turn;
      const text = repaired.get(index)?.trim();
      return text ? { ...turn, text } : turn;
    });
  } catch (err) {
    console.error('[transcript] Amharic caller transcript repair failed:', err);
    return turns;
  }
}

export function transcriptNeedsAmharicRepair(
  turns: StoredTranscriptTurn[],
): boolean {
  return turns.some(
    (turn) =>
      turn.speaker === 'caller' &&
      turn.text.trim().length > 0 &&
      !isAmharicText(turn.text),
  );
}

function parseTranscriptRepair(text: string): Map<number, string> {
  const json = extractJsonArray(text);
  if (!json) return new Map();

  const parsed = JSON.parse(json) as Array<{ index?: unknown; text?: unknown }>;
  const repaired = new Map<number, string>();
  for (const item of parsed) {
    if (typeof item.index !== 'number' || typeof item.text !== 'string') {
      continue;
    }
    repaired.set(item.index, item.text);
  }
  return repaired;
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
