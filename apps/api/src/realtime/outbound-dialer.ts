import { prisma } from '@call-center/db';
import { AppError } from '../common/middleware/error-handler.js';
import { getAriClient } from './ari-client.js';

type AriOriginateClient = {
  channels: {
    originate: (opts: {
      endpoint: string;
      app: string;
      appArgs: string;
      callerId?: string;
      channelId?: string;
      timeout?: number;
      variables?: { variables: Record<string, string> };
    }) => Promise<unknown>;
  };
  endpoints?: {
    get: (opts: {
      tech: string;
      resource: string;
    }) => Promise<{ state?: string }>;
  };
};

export async function dialCampaignRecipient(opts: {
  campaignId: string;
  recipientId: string;
}): Promise<{ callId: string }> {
  const ari = getAriClient() as AriOriginateClient | null;
  if (!ari) throw new AppError(503, 'Asterisk ARI is not connected');

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: opts.recipientId },
    include: {
      contact: true,
      campaign: {
        include: {
          agent: true,
          phoneNumber: true,
        },
      },
    },
  });
  if (!recipient || recipient.campaignId !== opts.campaignId) {
    throw new AppError(404, 'Campaign recipient not found');
  }

  const campaign = recipient.campaign;
  const callerNumber = campaign.phoneNumber?.number ?? 'campaign';
  const endpoint = outboundEndpoint(recipient.phoneNumber);
  await assertDialEndpointReachable(ari, endpoint);

  const call = await prisma.call.create({
    data: {
      organizationId: campaign.organizationId,
      agentId: campaign.agentId,
      contactId: recipient.contactId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      direction: 'outbound',
      callerNumber,
      calleeNumber: recipient.phoneNumber,
      status: 'ringing',
      startedAt: new Date(),
    },
  });

  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: {
      lastCallId: call.id,
      lastAttemptAt: new Date(),
      deliveryStatus: 'ringing',
      lastError: null,
    },
  });

  console.log(
    `[campaign] dialing recipient ${recipient.id} (${recipient.phoneNumber}) via ${endpoint}`,
  );
  try {
    await ari.channels.originate({
      endpoint,
      app: process.env.ARI_APP_NAME ?? 'call-center',
      appArgs: `outbound:${call.id}`,
      callerId: callerNumber,
      channelId: call.id,
      timeout: campaign.callTimeoutSeconds,
      variables: {
        variables: {
          CAMPAIGN_ID: campaign.id,
          CAMPAIGN_RECIPIENT_ID: recipient.id,
          CALL_ID: call.id,
        },
      },
    });
    return { callId: call.id };
  } catch (err) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: 'failed',
        endedAt: new Date(),
      },
    });
    throw err;
  }
}

async function assertDialEndpointReachable(
  ari: AriOriginateClient,
  endpoint: string,
) {
  const parsed = parseSimplePjsipEndpoint(endpoint);
  if (!parsed || !ari.endpoints?.get) return;

  try {
    const info = await ari.endpoints.get(parsed);
    if (info.state === 'offline') {
      const message = `SIP endpoint ${endpoint} is offline according to ARI; attempting originate anyway because mobile SIP qualify can be stale.`;
      if (process.env.OUTBOUND_STRICT_ENDPOINT_CHECK === 'true') {
        throw new AppError(
          409,
          `SIP endpoint ${endpoint} is offline. Open Linphone and re-register extension ${parsed.resource}.`,
        );
      }
      console.warn(`[campaign] ${message}`);
      return;
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.warn(
      `[campaign] could not verify ${endpoint} with ARI; attempting originate anyway:`,
      err,
    );
  }
}

export function outboundEndpoint(phoneNumber: string): string {
  const specific =
    process.env[`OUTBOUND_DIAL_ENDPOINT_${endpointEnvKey(phoneNumber)}`];
  if (specific) {
    return normalizeRegisteredPjsipEndpoint(
      renderEndpointTemplate(specific, phoneNumber),
      phoneNumber,
    );
  }

  const template =
    process.env.OUTBOUND_DIAL_ENDPOINT_TEMPLATE ?? 'PJSIP/{{number}}';
  return normalizeRegisteredPjsipEndpoint(
    renderEndpointTemplate(template, phoneNumber),
    phoneNumber,
  );
}

function renderEndpointTemplate(template: string, phoneNumber: string): string {
  return template
    .replaceAll('{{number}}', phoneNumber)
    .replaceAll('{{phoneNumber}}', phoneNumber);
}

function endpointEnvKey(phoneNumber: string): string {
  return phoneNumber.replace(/[^A-Za-z0-9]/g, '_');
}

export function normalizeRegisteredPjsipEndpoint(
  endpoint: string,
  phoneNumber: string,
): string {
  const trimmed = endpoint.trim();
  const match = /^PJSIP\/([^/]+)\/sip:/i.exec(trimmed);
  if (!match) return trimmed;

  const resource = match[1] ?? '';
  if (resource !== phoneNumber) return trimmed;

  console.warn(
    `[campaign] normalized stale contact URI ${trimmed} to PJSIP/${resource}; registered SIP contacts are dynamic`,
  );
  return `PJSIP/${resource}`;
}

function parseSimplePjsipEndpoint(
  endpoint: string,
): { tech: string; resource: string } | null {
  const match = /^PJSIP\/([^/]+)$/.exec(endpoint.trim());
  if (!match) return null;
  return { tech: 'PJSIP', resource: match[1] ?? '' };
}
