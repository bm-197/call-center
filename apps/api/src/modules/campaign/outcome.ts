import OpenAI from 'openai';

export type CampaignOutcome =
  | 'interested'
  | 'not_interested'
  | 'callback_requested'
  | 'opted_out'
  | 'needs_human'
  | 'unknown';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  client ??= new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
  return client;
}

const OPT_OUT_PATTERNS = [
  /\b(stop|unsubscribe|remove me|do not call|don't call|dont call)\b/i,
  /አትደውሉ/i,
  /አትደውል/i,
  /እንዳትደውሉ/i,
  /ከዝርዝር.*አስወግዱ/i,
  /ተዉ/i,
];

const NOT_INTERESTED_PATTERNS = [
  /\b(not interested|no thanks|no thank you)\b/i,
  /አይፈልግም/i,
  /አይፈልገኝም/i,
  /አያስፈልገኝም/i,
];

const CALLBACK_PATTERNS = [
  /\b(call me back|call later|later|tomorrow|another time)\b/i,
  /በኋላ/i,
  /ነገ/i,
  /ደውሉ/i,
];

const INTEREST_PATTERNS = [
  /\b(interested|tell me more|yes|okay|send|price|details)\b/i,
  /እፈልጋለሁ/i,
  /አዎ/i,
  /ዝርዝር/i,
  /ዋጋ/i,
];

export function detectOptOutIntent(text: string): boolean {
  return OPT_OUT_PATTERNS.some((p) => p.test(text));
}

export async function classifyCampaignOutcome(
  transcript: Array<{ speaker: string; text: string }>,
): Promise<{ outcome: CampaignOutcome; notes: string | null }> {
  const joined = transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
  if (OPT_OUT_PATTERNS.some((p) => p.test(joined))) {
    return { outcome: 'opted_out', notes: 'Caller asked not to be contacted.' };
  }
  if (CALLBACK_PATTERNS.some((p) => p.test(joined))) {
    return {
      outcome: 'callback_requested',
      notes: 'Caller requested a callback.',
    };
  }
  if (NOT_INTERESTED_PATTERNS.some((p) => p.test(joined))) {
    return { outcome: 'not_interested', notes: 'Caller was not interested.' };
  }
  if (INTEREST_PATTERNS.some((p) => p.test(joined))) {
    return { outcome: 'interested', notes: 'Caller showed interest.' };
  }
  const openRouter = getClient();
  if (!openRouter || joined.trim().length === 0) {
    return { outcome: 'unknown', notes: null };
  }

  try {
    const res = await openRouter.chat.completions.create({
      model: process.env.CAMPAIGN_OUTCOME_MODEL ?? 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Classify a marketing call transcript. Return strict JSON with outcome and notes. outcome must be one of: interested, not_interested, callback_requested, opted_out, needs_human, unknown.',
        },
        { role: 'user', content: joined.slice(0, 12_000) },
      ],
      response_format: { type: 'json_object' },
    });
    const content = res.choices[0]?.message.content ?? '{}';
    const parsed = JSON.parse(content) as { outcome?: string; notes?: string };
    const allowed: CampaignOutcome[] = [
      'interested',
      'not_interested',
      'callback_requested',
      'opted_out',
      'needs_human',
      'unknown',
    ];
    const outcome = allowed.includes(parsed.outcome as CampaignOutcome)
      ? (parsed.outcome as CampaignOutcome)
      : 'unknown';
    return { outcome, notes: parsed.notes ?? null };
  } catch (err) {
    console.warn('[campaign] outcome classification failed:', err);
    return { outcome: 'unknown', notes: null };
  }
}
