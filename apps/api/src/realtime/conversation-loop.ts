import {
  GoogleGenAI,
  Modality,
  type FunctionCall,
  type FunctionDeclaration,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { prisma } from '@call-center/db';
import type { ConversationTranscriptTurn } from './transcript.js';
import { AudioBridge } from './audio-bridge.js';
import { SttStream } from './stt-stream.js';
import { TtsPlayer } from './tts-player.js';
import { executeTool, getGeminiToolConfig } from '../tools/runtime.js';
import type { ToolExecutionContext } from '../tools/registry.js';
import {
  GEMINI_INPUT_SAMPLE_RATE,
  geminiPcm16Base64ToMulaw8k,
  mulaw8kToGeminiPcm16Base64,
  parsePcmRate,
} from './live-audio-codec.js';
import { synthesizeMulaw } from './tts.js';

type AgentConfig = {
  id: string;
  organizationId: string;
  language: string; // "am" | "en" | "am+en"
  systemPrompt: string;
  llmModel: string;
  ttsVoice: string;
  handoffEnabled: boolean;
  handoffMessage: string;
};

type Transcript = ConversationTranscriptTurn[];
type CampaignContext = {
  openingMessage: string;
  campaignPrompt: string;
  variables: Record<string, string | number | boolean | null>;
};
type CallContext = {
  callId: string;
  contactId?: string | null;
  callerNumber?: string | null;
  calleeNumber?: string | null;
};
type HandoffRequest = {
  reason: string;
  message: string;
};
type EndCallRequest = {
  reason: string;
  message: string;
};
type ConversationLoopOptions = {
  onHandoffRequested?: (request: HandoffRequest) => Promise<void> | void;
  onEndCallRequested?: (request: EndCallRequest) => Promise<void> | void;
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
const VAD_PREFIX_PADDING_MS = Number(
  process.env.GEMINI_LIVE_VAD_PREFIX_PADDING_MS ?? 300,
);
const VAD_SILENCE_DURATION_MS = Number(
  process.env.GEMINI_LIVE_VAD_SILENCE_DURATION_MS ?? 1_000,
);
const CALLER_TRANSCRIPT_STT_ENABLED =
  process.env.CALLER_TRANSCRIPT_STT_ENABLED !== 'false';
const TRANSCRIPT_ALIGN_WAIT_MS = Number(
  process.env.CALLER_TRANSCRIPT_ALIGN_WAIT_MS ?? 2_500,
);
const HANDOFF_TOOL_NAME = 'request_human_handoff';
const END_CALL_TOOL_NAME = 'end_call';
const DEFAULT_LIVE_VOICE = 'Puck';
const LIVE_VOICES = new Set([
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
]);
const HANDOFF_TOOL_DECLARATION = {
  name: HANDOFF_TOOL_NAME,
  description:
    'Request transfer to a human agent when the caller asks for a person, the request is outside your available knowledge or tools, or you cannot safely complete the task.',
  parametersJsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: {
        type: 'string',
        description:
          'Short Amharic reason for the handoff, suitable for the human agent dashboard.',
      },
    },
    required: ['reason'],
  },
  responseJsonSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      reason: { type: 'string' },
    },
  },
} satisfies FunctionDeclaration;
const END_CALL_TOOL_DECLARATION = {
  name: END_CALL_TOOL_NAME,
  description:
    'End the phone call only when the caller has clearly finished, says goodbye, thanks you and has no remaining request, or the conversation is otherwise complete. The system will speak the provided final message and then hang up. Do not use it while the caller still needs help.',
  parametersJsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: {
        type: 'string',
        description:
          'Short internal reason for ending the call, for example caller said goodbye or request completed.',
      },
      message: {
        type: 'string',
        description:
          'One short final spoken sentence in the caller language before hanging up.',
      },
    },
    required: ['reason', 'message'],
  },
  responseJsonSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      reason: { type: 'string' },
    },
  },
} satisfies FunctionDeclaration;

export class ConversationLoop {
  private player: TtsPlayer;
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private callerStt: SttStream | null = null;
  public readonly transcript: Transcript = [];
  private closed = false;
  private currentGeminiUserText = '';
  private currentAssistantText = '';
  private pendingCallerTurns: ConversationTranscriptTurn[] = [];
  private pendingAssistantTurn: ConversationTranscriptTurn | null = null;
  private pendingAssistantTimer: NodeJS.Timeout | null = null;
  private handoffRequested = false;
  private endCallRequested = false;

  constructor(
    private readonly bridge: AudioBridge,
    private readonly agent: AgentConfig,
    private readonly campaignContext: CampaignContext | null = null,
    private readonly callContext: CallContext | null = null,
    private readonly options: ConversationLoopOptions = {},
  ) {
    this.player = new TtsPlayer(bridge);
  }

  async start(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for live calls');

    this.ai = new GoogleGenAI({ apiKey });
    const systemInstruction = await this.buildSystemInstruction();
    const tools = withInternalTools(
      await getGeminiToolConfig({
        organizationId: this.agent.organizationId,
        agentId: this.agent.id,
      }),
      this.agent.handoffEnabled,
    );
    this.session = await this.connectLiveSession(systemInstruction, tools);
    this.startCallerTranscriptStream();

    this.bridge.on('audio', (chunk: Buffer) => {
      this.sendCallerAudio(chunk);
      this.callerStt?.write(chunk);
    });
    this.sendGreeting();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.callerStt?.close();
    this.callerStt = null;
    this.commitTranscriptTurn();
    this.flushTranscriptBuffers();
    this.player.cancel();
    this.session?.close();
    this.session = null;
  }

  private startCallerTranscriptStream(): void {
    if (!CALLER_TRANSCRIPT_STT_ENABLED) {
      console.log(
        '[conv] caller transcript STT disabled; saved caller transcript will be omitted',
      );
      return;
    }

    const stt = new SttStream({
      languageCode: callerTranscriptLanguageCode(this.agent.language),
    });
    this.callerStt = stt;

    stt.on('final', (text) => this.queueCallerTranscript(text));
    stt.on('error', (err) => {
      console.error('[conv] caller transcript STT error:', err);
      stt.close();
      if (this.callerStt === stt) {
        this.callerStt = null;
      }
    });

    stt
      .start()
      .then(() => {
        console.log(
          `[conv] caller transcript STT connected: ${callerTranscriptLanguageCode(this.agent.language)}`,
        );
      })
      .catch((err) => {
        console.error(
          '[conv] caller transcript STT failed to start; using Gemini Live transcript fallback:',
          err,
        );
        stt.close();
        if (this.callerStt === stt) {
          this.callerStt = null;
        }
      });
  }

  private async connectLiveSession(
    systemInstruction: string,
    tools: Awaited<ReturnType<typeof getGeminiToolConfig>>,
  ): Promise<Session> {
    if (!this.ai) throw new Error('Gemini client is not initialized');

    const speechConfig = liveSpeechConfig(this.agent.ttsVoice);
    const callbacks = {
      onopen: () => console.log(`[conv] Gemini Live connected: ${LIVE_MODEL}`),
      onmessage: (message: Parameters<typeof this.handleLiveMessage>[0]) =>
        this.handleLiveMessage(message),
      onerror: (err: unknown) =>
        console.error('[conv] Gemini Live error:', err),
      onclose: (event: { code: number; reason: string }) =>
        console.log(`[conv] Gemini Live closed: ${event.code} ${event.reason}`),
    };
    const toolConfig = tools.length > 0 ? { tools } : {};

    return this.ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: liveRealtimeInputConfig(),
        speechConfig,
        systemInstruction,
        ...toolConfig,
      },
      callbacks,
    });
  }

  private sendCallerAudio(chunk: Buffer): void {
    if (
      this.closed ||
      this.handoffRequested ||
      this.endCallRequested ||
      !this.session ||
      chunk.length === 0
    )
      return;
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

  private handleLiveMessage(message: LiveServerMessage): void {
    if (message.toolCall?.functionCalls?.length) {
      void this.handleToolCalls(message.toolCall.functionCalls);
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.player.cancel();
    }

    this.currentGeminiUserText = mergeTranscriptText(
      this.currentGeminiUserText,
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

  private async handleToolCalls(functionCalls: FunctionCall[]): Promise<void> {
    const responses: FunctionResponse[] = [];

    for (const call of functionCalls) {
      const name = call.name ?? '';
      try {
        if (!name) throw new Error('Tool call is missing a function name');
        if (name === HANDOFF_TOOL_NAME) {
          const result = await this.handleHandoffTool(call.args ?? {});
          responses.push({
            ...(call.id ? { id: call.id } : {}),
            name,
            response: { output: result },
          });
          continue;
        }
        if (name === END_CALL_TOOL_NAME) {
          const result = await this.handleEndCallTool(call.args ?? {});
          responses.push({
            ...(call.id ? { id: call.id } : {}),
            name,
            response: { output: result },
          });
          continue;
        }
        const result = await executeTool(name, call.args ?? {}, {
          ...this.toolContext(),
          source: 'voice',
        });
        responses.push({
          ...(call.id ? { id: call.id } : {}),
          name,
          response: { output: result },
        });
        console.log(`[conv] tool ${name}: ${JSON.stringify(result)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        responses.push({
          ...(call.id ? { id: call.id } : {}),
          name,
          response: {
            error: {
              message,
            },
          },
        });
        console.error(`[conv] tool ${name || 'unknown'} failed:`, err);
      }
    }

    if (responses.length > 0 && !this.closed) {
      this.session?.sendToolResponse({ functionResponses: responses });
    }
  }

  private async handleHandoffTool(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.agent.handoffEnabled) {
      return { status: 'disabled', reason: 'Handoff is disabled' };
    }
    if (this.handoffRequested) {
      return { status: 'already_requested' };
    }

    const reason = parseHandoffReason(args);
    this.handoffRequested = true;
    this.commitTranscriptTurn();
    this.player.cancel();

    await this.playHandoffMessage();
    await this.options.onHandoffRequested?.({
      reason,
      message: this.agent.handoffMessage,
    });
    this.close();
    return { status: 'queued', reason };
  }

  private async handleEndCallTool(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.endCallRequested) {
      return { status: 'already_requested' };
    }
    if (this.handoffRequested) {
      return { status: 'handoff_already_requested' };
    }

    const request = parseEndCallRequest(args, this.agent.language);
    this.endCallRequested = true;
    this.commitTranscriptTurn();
    this.player.cancel();

    await this.playFinalMessage(request.message);
    await this.options.onEndCallRequested?.(request);
    this.close();
    return { status: 'ending', reason: request.reason };
  }

  private async playHandoffMessage(): Promise<void> {
    const message = this.agent.handoffMessage.trim();
    if (!message) return;

    await this.playFinalMessage(message, '[conv] handoff message TTS failed:');
  }

  private async playFinalMessage(
    message: string,
    errorPrefix = '[conv] final message TTS failed:',
  ): Promise<void> {
    const clean = message.trim();
    if (!clean) return;

    this.queueAssistantTranscript(clean);
    try {
      const audio = await synthesizeMulaw({
        text: clean,
        languageCode: callerTranscriptLanguageCode(this.agent.language),
        voiceName: handoffTtsVoice(this.agent),
      });
      this.player.enqueue(audio);
      this.player.flush();
      await this.player.drained();
    } catch (err) {
      console.error(errorPrefix, err);
    }
  }

  private toolContext(): ToolExecutionContext {
    return {
      organizationId: this.agent.organizationId,
      agentId: this.agent.id,
      callId: this.callContext?.callId ?? null,
      contactId: this.callContext?.contactId ?? null,
      callerNumber: this.callContext?.callerNumber ?? null,
      calleeNumber: this.callContext?.calleeNumber ?? null,
      source: 'voice',
    };
  }

  private commitTranscriptTurn(): void {
    const assistantText = this.currentAssistantText.trim();
    if (assistantText) {
      this.queueAssistantTranscript(assistantText);
    }

    this.currentGeminiUserText = '';
    this.currentAssistantText = '';
  }

  private queueCallerTranscript(text: string): void {
    const content = text.trim();
    if (!content) return;

    this.pendingCallerTurns.push({
      role: 'user',
      content,
      at: new Date(),
    });

    if (this.pendingAssistantTurn) {
      this.flushTranscriptBuffers();
    }
  }

  private queueAssistantTranscript(text: string): void {
    const content = text.trim();
    if (!content) return;

    if (this.pendingAssistantTurn) {
      this.flushTranscriptBuffers();
    }

    this.pendingAssistantTurn = {
      role: 'assistant',
      content,
      at: new Date(),
    };

    if (this.pendingCallerTurns.length > 0) {
      this.flushTranscriptBuffers();
      return;
    }

    this.pendingAssistantTimer = setTimeout(
      () => this.flushTranscriptBuffers(),
      TRANSCRIPT_ALIGN_WAIT_MS,
    );
  }

  private flushTranscriptBuffers(): void {
    if (this.pendingAssistantTimer) {
      clearTimeout(this.pendingAssistantTimer);
      this.pendingAssistantTimer = null;
    }

    for (const turn of this.pendingCallerTurns) {
      this.transcript.push(turn);
      console.log(`[conv] user: ${turn.content}`);
    }
    this.pendingCallerTurns = [];

    if (this.pendingAssistantTurn) {
      this.transcript.push(this.pendingAssistantTurn);
      console.log(`[conv] ai: ${this.pendingAssistantTurn.content}`);
      this.pendingAssistantTurn = null;
    }
  }

  private async buildSystemInstruction(): Promise<string> {
    const knowledgeContext = await this.loadKnowledgeContext();
    const voiceConstraint =
      'This is a live phone call. Speak naturally, briefly, and in plain language. ' +
      'Do not use markdown, headings, bullet symbols, or code formatting because the response is spoken aloud. ' +
      'Use the provided knowledge context when it is relevant. If the answer is not in the context, say so briefly and ask a useful follow-up question.';
    const toolConstraint =
      'When the caller asks you to take an action, use the available tools instead of only saying you will do it. ' +
      'If a tool returns confirmation_required, ask the caller to confirm the exact action in a short spoken sentence. ' +
      'Only after the caller clearly confirms, call confirm_tool_action with the confirmationId. If the caller refuses or is unclear, call confirm_tool_action with confirmed false or ask one clarifying question.';
    const transcriptionConstraint = this.agent.language.startsWith('en')
      ? ''
      : 'The caller is expected to speak Amharic. Treat unclear caller audio as Amharic, and do not switch to Hindi, Chinese, Arabic, or other languages unless the caller clearly speaks that language.';
    const handoffConstraint = this.agent.handoffEnabled
      ? 'If the caller asks for a human agent, asks to be transferred, becomes upset, or asks for something outside your knowledge or available tools, call request_human_handoff with a concise Amharic reason for the human agent. Do not keep trying after the handoff request.'
      : '';
    const endCallConstraint =
      'When the caller clearly has no remaining request, says goodbye, or the conversation is complete, call end_call with a concise reason and a short final spoken sentence in the message field. The system will say that message and hang up. Do not call end_call while the caller still needs help or while a tool action is still pending.';
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
      toolConstraint,
      transcriptionConstraint,
      handoffConstraint,
      endCallConstraint,
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

function withInternalTools(
  tools: Awaited<ReturnType<typeof getGeminiToolConfig>>,
  handoffEnabled: boolean,
): Awaited<ReturnType<typeof getGeminiToolConfig>> {
  const declarations = [
    ...(handoffEnabled ? [HANDOFF_TOOL_DECLARATION] : []),
    END_CALL_TOOL_DECLARATION,
  ];
  return [...tools, { functionDeclarations: declarations }];
}

function parseHandoffReason(args: Record<string, unknown>): string {
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  return reason || 'ደዋዩ ከሰው ወኪል ጋር መነጋገር ጠይቋል።';
}

function parseEndCallRequest(
  args: Record<string, unknown>,
  agentLanguage: string,
): EndCallRequest {
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  const message = typeof args.message === 'string' ? args.message.trim() : '';
  return {
    reason: reason || 'Conversation completed',
    message:
      message ||
      (agentLanguage.startsWith('en')
        ? 'Thank you for calling. Goodbye.'
        : 'ስለደወሉ እናመሰግናለን። ደህና ይሁኑ።'),
  };
}

function handoffTtsVoice(agent: AgentConfig): string {
  if (process.env.HANDOFF_TTS_VOICE) return process.env.HANDOFF_TTS_VOICE;
  if (agent.ttsVoice.includes('-')) return agent.ttsVoice;
  return agent.language.startsWith('en')
    ? 'en-US-Standard-C'
    : 'am-ET-Standard-A';
}

export function callerTranscriptLanguageCode(agentLanguage: string): string {
  return agentLanguage.startsWith('en') ? 'en-US' : 'am-ET';
}

export function liveRealtimeInputConfig(): {
  automaticActivityDetection: {
    prefixPaddingMs: number;
    silenceDurationMs: number;
  };
} {
  return {
    automaticActivityDetection: {
      prefixPaddingMs: VAD_PREFIX_PADDING_MS,
      silenceDurationMs: VAD_SILENCE_DURATION_MS,
    },
  };
}

export function liveSpeechConfig(voiceName: string): {
  voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
} {
  return {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: LIVE_VOICES.has(voiceName) ? voiceName : DEFAULT_LIVE_VOICE,
      },
    },
  };
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
