import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// Sentence terminators: ASCII punctuation + Amharic full stop (።) and
// question/exclamation markers (፧, ፨). Newlines also flush.
const TERMINATORS = /[.!?።፧፨\n]/;

/**
 * Remove markdown formatting that TTS would read aloud as punctuation
 * ("asterisk asterisk hello asterisk asterisk"). We're piping straight
 * to a phone, no rendering, so all of it has to go.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // bold/italic asterisks and underscores: **x**, *x*, __x__, _x_
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      // inline code `x` and code fences ```...```
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // links [label](url) → label
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // headings and bullet markers at start of line.
      // Numbered list markers ("1. ", "2. ") are intentionally kept —
      // TTS reads them naturally as "first", "second", etc.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      // collapse stray runs of whitespace introduced by the above
      .replace(/[ \t]+/g, ' ')
      .trim()
  );
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type StreamOptions = {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

/**
 * Stream a chat completion, yielding each completed sentence as soon as it
 * lands so TTS can begin synthesizing while the LLM keeps writing.
 */
export async function* streamSentences(
  opts: StreamOptions,
): AsyncGenerator<string, string, void> {
  const stream = await client.chat.completions.create(
    {
      model: opts.model,
      messages: opts.messages,
      stream: true,
    },
    { signal: opts.signal },
  );

  let buffer = '';
  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? '';
    if (!delta) continue;
    buffer += delta;
    full += delta;

    let match: RegExpMatchArray | null;
    while ((match = buffer.match(TERMINATORS)) !== null) {
      const cutoff = (match.index ?? 0) + 1;
      const sentence = stripMarkdown(buffer.slice(0, cutoff));
      buffer = buffer.slice(cutoff);
      if (sentence) yield sentence;
    }
  }

  const tail = stripMarkdown(buffer);
  if (tail) yield tail;
  return stripMarkdown(full);
}
