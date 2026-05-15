/**
 * Conversation orchestrator.
 *
 * On StasisStart:
 *   - Resolve which org/agent owns the dialed number
 *   - Create the Call row
 *   - Open AudioBridge + externalMedia channel + mixing bridge
 *   - Hand control to ConversationLoop (greeting → STT → KB → LLM → TTS)
 *
 * On StasisEnd:
 *   - Tear down the bridge, persist transcript + duration on the Call row
 */

import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@call-center/db';
import { AudioBridge } from './audio-bridge.js';
import { ConversationLoop } from './conversation-loop.js';
import { toStoredTranscript } from './transcript.js';
import { CallRecorder } from './call-recorder.js';
import { r2UploadFile, R2_BUCKETS } from '../common/r2.js';
import { finalizeCampaignRecipientFromCall } from '../modules/campaign/campaign.service.js';
import {
  recipientVariables,
  renderTemplate,
  type TemplateVariables,
} from '../modules/campaign/template.js';

const EXTERNAL_HOST_FOR_ASTERISK =
  process.env.ASTERISK_RTP_HOST ?? 'host.docker.internal';

type AriEvent = {
  args?: string[];
  channel?: {
    id: string;
    caller?: { number?: string; name?: string };
    dialplan?: { exten?: string };
  };
};

type AriChannel = {
  id: string;
  caller: { number?: string; name?: string };
  dialplan: { exten?: string };
  hangup: () => Promise<void>;
  answer: () => Promise<void>;
};

type AriBridge = {
  id: string;
  addChannel: (opts: { channel: string | string[] }) => Promise<unknown>;
  destroy: () => Promise<unknown>;
};

type AriClient = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  channels: {
    externalMedia: (opts: {
      app: string;
      external_host: string;
      format: string;
    }) => Promise<AriChannel>;
  };
  bridges: {
    create: (opts: { type: string }) => Promise<AriBridge>;
  };
};

type CallState = {
  callId: string;
  organizationId: string;
  campaign?: {
    campaignId: string;
    recipientId: string;
    contactId: string | null;
  };
  startedAt: number;
  bridge: AudioBridge;
  ariBridge: AriBridge;
  externalChannel: AriChannel;
  loop: ConversationLoop;
  recorder: CallRecorder;
};
const callsByChannel = new Map<string, CallState>();

type AgentConfig = {
  id: string;
  organizationId: string;
  language: string;
  systemPrompt: string;
  llmModel: string;
  ttsVoice: string;
};

type CallSetup = {
  callId: string;
  organizationId: string;
  agent: AgentConfig;
  callerNumber: string;
  calleeNumber: string;
  contactId?: string | null;
  campaignContext?: {
    openingMessage: string;
    campaignPrompt: string;
    variables: TemplateVariables;
  };
  campaignState?: {
    campaignId: string;
    recipientId: string;
    contactId: string | null;
  };
};

export function initOrchestrator(client: AriClient, appName: string): void {
  client.on('StasisStart', (...args: unknown[]) => {
    const [event, channel] = args as [AriEvent, AriChannel];
    handleStart(client, appName, event, channel).catch((err) => {
      console.error('[orchestrator] StasisStart failed:', err);
      channel.hangup().catch(() => {});
    });
  });

  client.on('StasisEnd', (...args: unknown[]) => {
    const [, channel] = args as [AriEvent, AriChannel];
    handleEnd(channel).catch((err) => {
      console.error('[orchestrator] StasisEnd failed:', err);
    });
  });
}

async function handleStart(
  client: AriClient,
  appName: string,
  event: AriEvent,
  channel: AriChannel,
): Promise<void> {
  const channelName = (channel as unknown as { name?: string }).name ?? '';
  if (channelName.startsWith('UnicastRTP/')) return;

  const callerNumber =
    channel.caller?.number ?? event.channel?.caller?.number ?? 'unknown';
  const calleeNumber =
    channel.dialplan?.exten ?? event.channel?.dialplan?.exten ?? 'unknown';

  console.log(
    `[orchestrator] StasisStart: ${callerNumber} → ${calleeNumber} (channel ${channel.id})`,
  );

  const outboundCallId =
    outboundCallIdFromEvent(event) ??
    (await outboundCallIdFromChannel(channel));
  const setup = outboundCallId
    ? await prepareOutboundCall(outboundCallId)
    : await prepareInboundCall(callerNumber, calleeNumber);

  if (!setup) {
    console.warn('[orchestrator] no routing match — hanging up');
    await channel.hangup();
    return;
  }
  console.log(
    `[orchestrator] using Call ${setup.callId} (agent ${setup.agent.id}, ${outboundCallId ? 'outbound' : 'inbound'})`,
  );

  await channel.answer();

  const bridge = new AudioBridge();
  const port = await bridge.open();
  const externalHost = `${EXTERNAL_HOST_FOR_ASTERISK}:${port}`;
  console.log(
    `[orchestrator] AudioBridge listening on UDP :${port}, telling Asterisk to send to ${externalHost}`,
  );

  const externalChannel = await client.channels.externalMedia({
    app: appName,
    external_host: externalHost,
    format: 'ulaw',
  });
  const ariBridge = await client.bridges.create({ type: 'mixing' });
  await ariBridge.addChannel({ channel: [channel.id, externalChannel.id] });
  console.log(`[orchestrator] bridge ${ariBridge.id} mixing both channels`);

  const loop = new ConversationLoop(
    bridge,
    setup.agent,
    setup.campaignContext ?? null,
    {
      callId: setup.callId,
      contactId: setup.contactId ?? null,
      callerNumber: setup.callerNumber,
      calleeNumber: setup.calleeNumber,
    },
  );

  const recorder = new CallRecorder(join(tmpdir(), `call-${setup.callId}.wav`));
  recorder.start();
  bridge.on('audio', (frame: Buffer) => recorder.writeInbound(frame));
  bridge.on('outbound', (frame: Buffer) => recorder.writeOutbound(frame));

  callsByChannel.set(channel.id, {
    callId: setup.callId,
    organizationId: setup.organizationId,
    ...(setup.campaignState ? { campaign: setup.campaignState } : {}),
    startedAt: Date.now(),
    bridge,
    ariBridge,
    externalChannel,
    loop,
    recorder,
  });

  await loop.start();
}

async function handleEnd(channel: AriChannel): Promise<void> {
  const state = callsByChannel.get(channel.id);
  if (!state) return;

  state.loop.close();
  await state.externalChannel.hangup().catch(() => {});
  await state.ariBridge.destroy().catch(() => {});
  state.bridge.close();

  const duration = Math.floor((Date.now() - state.startedAt) / 1000);
  const transcript = toStoredTranscript(state.loop.transcript);

  // Recording: finalize WAV on disk, upload to R2, then delete the temp
  // file. Uploads run in the background so the orchestrator can move on
  // — we'll patch Call.recordingUrl when the upload completes.
  let recordingDuration: number | undefined;
  let recordingKey: string | undefined;
  try {
    const result = await state.recorder.finalize();
    recordingDuration = Math.round(result.durationSec);
    recordingKey = `org-${state.organizationId}/call-${state.callId}.wav`;
    void uploadRecording(result.filePath, recordingKey, state.callId);
  } catch (err) {
    console.error(`[orchestrator] recorder finalize failed:`, err);
  }

  await prisma.call.update({
    where: { id: state.callId },
    data: {
      status: 'completed',
      endedAt: new Date(),
      duration,
      ...(recordingDuration !== undefined ? { recordingDuration } : {}),
      ...(transcript.length > 0 ? { transcriptAm: transcript } : {}),
    },
  });

  if (state.campaign) {
    await finalizeCampaignRecipientFromCall({
      campaignId: state.campaign.campaignId,
      recipientId: state.campaign.recipientId,
      contactId: state.campaign.contactId,
      transcript,
    }).catch((err) => {
      console.error(
        `[orchestrator] campaign recipient finalization failed for Call ${state.callId}:`,
        err,
      );
    });
  }

  callsByChannel.delete(channel.id);
  console.log(
    `[orchestrator] Call ${state.callId} completed (${duration}s, ${transcript.length} turns)`,
  );
}

async function prepareInboundCall(
  callerNumber: string,
  calleeNumber: string,
): Promise<CallSetup | null> {
  const agent = await resolveAgent(calleeNumber);
  if (!agent) return null;
  const contact = await prisma.contact.findFirst({
    where: {
      organizationId: agent.organizationId,
      phoneNumber: callerNumber,
    },
    select: { id: true },
  });

  const call = await prisma.call.create({
    data: {
      organizationId: agent.organizationId,
      agentId: agent.id,
      contactId: contact?.id ?? null,
      direction: 'inbound',
      callerNumber,
      calleeNumber,
      status: 'ai_handling',
      startedAt: new Date(),
    },
  });

  return {
    callId: call.id,
    organizationId: agent.organizationId,
    agent,
    callerNumber,
    calleeNumber,
    contactId: contact?.id ?? null,
  };
}

async function prepareOutboundCall(callId: string): Promise<CallSetup | null> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      campaign: { include: { agent: true } },
      campaignRecipient: { include: { contact: true } },
    },
  });
  if (!call || call.direction !== 'outbound') return null;
  if (!call.campaign || !call.campaignRecipient) {
    throw new Error(`Outbound Call ${callId} is missing campaign metadata`);
  }

  const campaign = call.campaign;
  const recipient = call.campaignRecipient;
  const variables = recipientVariables({
    phoneNumber: recipient.phoneNumber,
    displayName: recipient.displayName,
    email: recipient.email,
    variables: recipient.variables,
  });

  await prisma.$transaction([
    prisma.call.update({
      where: { id: call.id },
      data: { status: 'ai_handling' },
    }),
    prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'in_call',
        deliveryStatus: 'answered',
        lastError: null,
      },
    }),
  ]);

  return {
    callId: call.id,
    organizationId: call.organizationId,
    agent: campaign.agent,
    callerNumber: call.callerNumber,
    calleeNumber: call.calleeNumber,
    contactId: recipient.contactId,
    campaignContext: {
      openingMessage: renderTemplate(campaign.openingMessage, variables),
      campaignPrompt: campaign.campaignPrompt,
      variables,
    },
    campaignState: {
      campaignId: campaign.id,
      recipientId: recipient.id,
      contactId: recipient.contactId,
    },
  };
}

function outboundCallIdFromEvent(event: AriEvent): string | null {
  const arg = event.args?.find((value) => value.startsWith('outbound:'));
  const callId = arg?.slice('outbound:'.length).trim();
  return callId || null;
}

async function outboundCallIdFromChannel(
  channel: AriChannel,
): Promise<string | null> {
  const call = await prisma.call.findUnique({
    where: { id: channel.id },
    select: { id: true, direction: true },
  });
  return call?.direction === 'outbound' ? call.id : null;
}

async function uploadRecording(
  filePath: string,
  key: string,
  callId: string,
): Promise<void> {
  try {
    await r2UploadFile({
      bucket: R2_BUCKETS.recordings(),
      key,
      filePath,
      contentType: 'audio/wav',
    });
    await prisma.call.update({
      where: { id: callId },
      data: { recordingUrl: key },
    });
    console.log(
      `[orchestrator] uploaded recording → r2://${R2_BUCKETS.recordings()}/${key}`,
    );
  } catch (err) {
    console.error(
      `[orchestrator] recording upload failed for Call ${callId}:`,
      err,
    );
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

async function resolveAgent(calleeNumber: string): Promise<AgentConfig | null> {
  const phone = await prisma.phoneNumber.findFirst({
    where: { number: calleeNumber, status: 'active' },
    include: { agent: true },
  });
  if (phone?.agent) return phone.agent;

  const activeAgent = await prisma.agent.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (activeAgent) {
    console.log(
      `[orchestrator] no PhoneNumber match — fallback active agent ${activeAgent.id}`,
    );
    return activeAgent;
  }

  const anyAgent = await prisma.agent.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (anyAgent) {
    console.log(
      `[orchestrator] no active agents — fallback draft agent ${anyAgent.id}`,
    );
    return anyAgent;
  }

  return null;
}
