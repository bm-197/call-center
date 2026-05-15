import { GoogleGenAI, Modality, type Session } from '@google/genai';
import { prisma } from '@call-center/db';
import { AudioBridge } from './audio-bridge.js';
import { TtsPlayer } from './tts-player.js';
import {
  GEMINI_INPUT_SAMPLE_RATE,
  geminiPcm16Base64ToMulaw8k,
  mulaw8kToGeminiPcm16Base64,
  parsePcmRate,
} from './live-audio-codec.js';

type AgentConfig = {
  id: string;
  organizationId: string;
  language: string; // "am" | "en" | "am+en"
  systemPrompt: string;
  llmModel: string;
  ttsVoice: string;
};

type Transcript = { role: 'user' | 'assistant'; content: string; at: Date }[];
type CampaignContext = {
  openingMessage: string;
  campaignPrompt: string;
  variables: Record<string, string | number | boolean | null>;
};

const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview';
const CONTEXT_SUMMARY_MODEL =
  process.env.GEMINI_CONTEXT_SUMMARY_MODEL ?? 'gemini-2.5-flash';
const MAX_DIRECT_CONTEXT_CHARS = Number(
  process.env.GEMINI_LIVE_CONTEXT_MAX_CHARS ?? 12_000,
);
const SUMMARY_TARGET_CHARS = Number(
  process.env.GEMINI_LIVE_CONTEXT_SUMMARY_CHARS ?? 6_000,
);

export class ConversationLoop {
  private player: TtsPlayer;
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  public readonly transcript: Transcript = [];
  private closed = false;
  private currentUserText = '';
  private currentAssistantText = '';

  constructor(
    private readonly bridge: AudioBridge,
    private readonly agent: AgentConfig,
    private readonly campaignContext: CampaignContext | null = null,
  ) {
    this.player = new TtsPlayer(bridge);
  }

  async start(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for live calls');

    this.ai = new GoogleGenAI({ apiKey });
    const systemInstruction = await this.buildSystemInstruction();

    this.session = await this.ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
      },
      callbacks: {
        onopen: () =>
          console.log(`[conv] Gemini Live connected: ${LIVE_MODEL}`),
        onmessage: (message) => this.handleLiveMessage(message),
        onerror: (err) => console.error('[conv] Gemini Live error:', err),
        onclose: (event) =>
          console.log(
            `[conv] Gemini Live closed: ${event.code} ${event.reason}`,
          ),
      },
    });

    this.bridge.on('audio', (chunk: Buffer) => this.sendCallerAudio(chunk));
    this.sendGreeting();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.player.cancel();
    this.session?.close();
    this.session = null;
  }

  private sendCallerAudio(chunk: Buffer): void {
    if (this.closed || !this.session || chunk.length === 0) return;
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: mulaw8kToGeminiPcm16Base64(chunk),
          mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
        },
      });
    } catch (err) {
      console.error('[conv] failed to stream caller audio:', err);
    }
  }

  private sendGreeting(): void {
    if (this.campaignContext) {
      this.session?.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'The outbound campaign call has just connected. Start speaking now using this opening message naturally, then continue the conversation according to the campaign instructions:\n\n' +
                  this.campaignContext.openingMessage,
              },
            ],
          },
        ],
        turnComplete: true,
      });
      return;
    }

    const language = this.agent.language.startsWith('en')
      ? 'English'
      : 'Amharic';
    this.session?.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            {
              text:
                `The phone call has just started. Greet the caller in ${language} ` +
                'in one short sentence and ask how you can help.',
            },
          ],
        },
      ],
      turnComplete: true,
    });
  }

  private handleLiveMessage(message: {
    serverContent?: {
      interrupted?: boolean;
      turnComplete?: boolean;
      inputTranscription?: { text?: string; finished?: boolean };
      outputTranscription?: { text?: string; finished?: boolean };
      modelTurn?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          text?: string;
        }>;
      };
    };
  }): void {
    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.player.cancel();
    }

    this.currentUserText = mergeTranscriptText(
      this.currentUserText,
      content.inputTranscription?.text,
    );
    this.currentAssistantText = mergeTranscriptText(
      this.currentAssistantText,
      content.outputTranscription?.text,
    );

    for (const part of content.modelTurn?.parts ?? []) {
      const audio = part.inlineData?.data;
      if (!audio) continue;

      const sampleRate = parsePcmRate(part.inlineData?.mimeType);
      const mulaw = geminiPcm16Base64ToMulaw8k(audio, sampleRate);
      this.player.enqueue(mulaw);
    }

    if (content.turnComplete) {
      this.player.flush();
      this.commitTranscriptTurn();
    }
  }

  private commitTranscriptTurn(): void {
    const userText = this.currentUserText.trim();
    if (userText) {
      this.transcript.push({ role: 'user', content: userText, at: new Date() });
      console.log(`[conv] user: ${userText}`);
    }

    const assistantText = this.currentAssistantText.trim();
    if (assistantText) {
      this.transcript.push({
        role: 'assistant',
        content: assistantText,
        at: new Date(),
      });
      console.log(`[conv] ai: ${assistantText}`);
    }

    this.currentUserText = '';
    this.currentAssistantText = '';
  }

  private async buildSystemInstruction(): Promise<string> {
    const knowledgeContext = await this.loadKnowledgeContext();
    const voiceConstraint =
      'This is a live phone call. Speak naturally, briefly, and in plain language. ' +
      'Do not use markdown, headings, bullet symbols, or code formatting because the response is spoken aloud. ' +
      'Use the provided knowledge context when it is relevant. If the answer is not in the context, say so briefly and ask a useful follow-up question.';
    const campaignInstruction = this.campaignContext
      ? [
          'This is an outbound campaign call.',
          'Your job is to share the campaign message, answer questions, collect useful feedback, and respect opt-out requests immediately.',
          this.campaignContext.campaignPrompt
            ? `Campaign instructions:\n${this.campaignContext.campaignPrompt}`
            : '',
          `Recipient variables:\n${JSON.stringify(this.campaignContext.variables)}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';

    return [
      this.agent.systemPrompt.trim(),
      voiceConstraint,
      campaignInstruction,
      knowledgeContext
        ? `Knowledge context for this agent and organization:\n${knowledgeContext}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async loadKnowledgeContext(): Promise<string> {
    const sources = await prisma.knowledgeSource.findMany({
      where: {
        organizationId: this.agent.organizationId,
        sourceContent: { not: null },
        OR: [{ agentId: this.agent.id }, { agentId: null }],
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        agentId: true,
        name: true,
        description: true,
        language: true,
        sourceContent: true,
      },
    });

    const sections = sources
      .map((source) => {
        const content = source.sourceContent?.trim();
        if (!content) return null;
        const scope =
          source.agentId === this.agent.id ? 'Agent-specific' : 'Organization';
        return [
          `[${scope}] ${source.name}`,
          source.description ? `Description: ${source.description}` : '',
          `Language: ${source.language}`,
          content,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .filter((section): section is string => Boolean(section));

    if (sections.length === 0) return '';

    const directContext = sections.join('\n\n---\n\n');
    if (directContext.length <= MAX_DIRECT_CONTEXT_CHARS) return directContext;

    return this.summarizeKnowledgeContext(directContext);
  }

  private async summarizeKnowledgeContext(context: string): Promise<string> {
    if (!this.ai) return context.slice(0, MAX_DIRECT_CONTEXT_CHARS);

    try {
      const response = await this.ai.models.generateContent({
        model: CONTEXT_SUMMARY_MODEL,
        contents:
          'Summarize the following Amharic/English call-center knowledge for a voice assistant. ' +
          `Keep facts, prices, policies, steps, names, and phone numbers. Stay under ${SUMMARY_TARGET_CHARS} characters.\n\n` +
          context,
      });
      const summary = response.text?.trim();
      if (summary) return summary;
    } catch (err) {
      console.error(
        '[conv] knowledge summary failed; using truncated context:',
        err,
      );
    }

    return context.slice(0, MAX_DIRECT_CONTEXT_CHARS);
  }
}

function mergeTranscriptText(
  current: string,
  next: string | undefined,
): string {
  if (!next) return current;
  if (!current) return next;
  if (next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  return `${current}${needsSpace(current, next) ? ' ' : ''}${next}`;
}

function needsSpace(left: string, right: string): boolean {
  return /\S$/.test(left) && /^\S/.test(right);
}
