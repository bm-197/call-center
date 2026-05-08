import { AudioBridge } from './audio-bridge.js';
import { SttStream } from './stt-stream.js';
import { synthesizeMulaw } from './tts.js';
import { streamSentences, type ChatMessage } from './llm-stream.js';
import { queryKnowledgeBase, formatChunksForPrompt } from './kb-query.js';
import { TtsPlayer } from './tts-player.js';

type AgentConfig = {
  id: string;
  organizationId: string;
  language: string; // "am" | "en" | "am+en"
  systemPrompt: string;
  llmModel: string;
  ttsVoice: string;
};

type Transcript = { role: 'user' | 'assistant'; content: string; at: Date }[];

const DEFAULT_GREETINGS: Record<string, string> = {
  am: 'ሰላም! እንዴት ልረዳዎት እችላለሁ?',
  en: 'Hello! How can I help you today?',
};

function languageCode(lang: string): { stt: string; tts: string } {
  if (lang.startsWith('en')) return { stt: 'en-US', tts: 'en-US' };
  return { stt: 'am-ET', tts: 'am-ET' };
}

function defaultGreeting(lang: string): string {
  const key = lang.startsWith('en') ? 'en' : 'am';
  return DEFAULT_GREETINGS[key]!;
}

export class ConversationLoop {
  private stt: SttStream;
  private player: TtsPlayer;
  private history: ChatMessage[] = [];
  public readonly transcript: Transcript = [];
  private currentTurn: AbortController | null = null;
  private closed = false;
  private langs: { stt: string; tts: string };

  constructor(
    private readonly bridge: AudioBridge,
    private readonly agent: AgentConfig,
  ) {
    this.langs = languageCode(agent.language);
    this.stt = new SttStream({ languageCode: this.langs.stt });
    this.player = new TtsPlayer(bridge);

    if (agent.systemPrompt.trim()) {
      this.history.push({ role: 'system', content: agent.systemPrompt });
    }
  }

  async start(): Promise<void> {
    let bytesIn = 0;
    let lastReport = Date.now();
    this.bridge.on('audio', (chunk: Buffer) => {
      bytesIn += chunk.length;
      this.stt.write(chunk);
      const now = Date.now();
      if (now - lastReport > 2000) {
        console.log(
          `[conv] inbound audio: ${bytesIn} bytes (${(bytesIn / 8000).toFixed(1)}s @ 8kHz µ-law)`,
        );
        lastReport = now;
      }
    });
    this.stt.on('interim', () => this.handleBargeIn());
    this.stt.on('final', (text: string) => {
      this.handleUserTurn(text).catch((err) =>
        console.error('[conv] turn failed:', err),
      );
    });
    this.stt.on('error', (err: Error) =>
      console.error('[conv] STT error:', err.message),
    );
    await this.stt.start();

    // Greeting — synthesized synchronously before STT can produce a result,
    // so it always plays first.
    await this.speak(defaultGreeting(this.agent.language), {
      role: 'assistant',
      record: true,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.currentTurn?.abort();
    this.stt.close();
    this.player.cancel();
  }

  private handleBargeIn(): void {
    // Real barge-in only happens while the AI is actually speaking back
    // to the caller. If we're still computing a response (KB/LLM in
    // flight) we let it finish — interims at this point are usually the
    // tail of the caller's just-finished utterance, not a fresh
    // interruption.
    if (!this.player.isPlaying()) return;
    console.log('[conv] barge-in: cancelling TTS + LLM');
    this.player.cancel();
    this.currentTurn?.abort();
  }

  private async handleUserTurn(userText: string): Promise<void> {
    if (this.closed) return;
    console.log(`[conv] user: ${userText}`);
    this.transcript.push({ role: 'user', content: userText, at: new Date() });

    const ctrl = new AbortController();
    this.currentTurn = ctrl;

    const chunks = await queryKnowledgeBase({
      query: userText,
      organizationId: this.agent.organizationId,
      agentId: this.agent.id,
      signal: ctrl.signal,
    });
    if (ctrl.signal.aborted) return;

    const kbContext = formatChunksForPrompt(chunks);
    // Voice-call constraints: this output is going straight to TTS, so
    // any markdown gets read aloud as punctuation. Keep replies short
    // and conversational.
    const voiceConstraint =
      'This is a live phone call. Your reply will be spoken aloud by a text-to-speech engine, so:\n' +
      '- Respond in plain text only. NEVER use markdown (no **bold**, _italics_, `code`, headings, or bullet points like "- " or "* ").\n' +
      '- Numbered lists ("1. ... 2. ...") are fine when listing options — they read naturally aloud.\n' +
      '- Keep replies short and conversational.';
    const systemPrompt = [
      this.agent.systemPrompt,
      voiceConstraint,
      kbContext ? `Reference information you may use:\n${kbContext}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.history.filter((m) => m.role !== 'system'),
      { role: 'user', content: userText },
    ];

    let assistantText = '';
    try {
      const gen = streamSentences({
        model: this.agent.llmModel,
        messages,
        signal: ctrl.signal,
      });
      for (;;) {
        const next = await gen.next();
        if (next.done) {
          assistantText = next.value ?? assistantText;
          break;
        }
        const sentence = next.value;
        assistantText += (assistantText ? ' ' : '') + sentence;
        await this.speak(sentence, { role: 'assistant', record: false });
        if (ctrl.signal.aborted) break;
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('[conv] LLM stream failed:', err);
      return;
    }

    if (assistantText.trim()) {
      this.history.push({ role: 'user', content: userText });
      this.history.push({ role: 'assistant', content: assistantText.trim() });
      this.transcript.push({
        role: 'assistant',
        content: assistantText.trim(),
        at: new Date(),
      });
      console.log(`[conv] ai: ${assistantText.trim()}`);
    }
    if (this.currentTurn === ctrl) this.currentTurn = null;
  }

  private async speak(
    text: string,
    meta: { role: 'assistant'; record: boolean },
  ): Promise<void> {
    if (!text.trim() || this.closed) return;
    try {
      const audio = await synthesizeMulaw({
        text,
        languageCode: this.langs.tts,
        voiceName: this.agent.ttsVoice,
      });
      if (this.closed) return;
      this.player.enqueue(audio);
      if (meta.record) {
        this.transcript.push({
          role: meta.role,
          content: text,
          at: new Date(),
        });
      }
    } catch (err) {
      console.error('[conv] TTS failed:', err);
    }
  }
}
