import { prisma, Prisma } from '@call-center/db';
import { AppError } from '../../common/middleware/error-handler.js';
import { classifyCampaignOutcome } from './outcome.js';

export const FINAL_RECIPIENT_STATUSES = ['completed', 'skipped', 'canceled'];

export async function getCampaignOrThrow(id: string, organizationId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId },
    include: {
      agent: { select: { id: true, name: true, status: true } },
      phoneNumber: { select: { id: true, number: true, friendlyName: true } },
    },
  });
  if (!campaign) throw new AppError(404, 'Campaign not found');
  return campaign;
}

export async function campaignSummary(campaignId: string) {
  const [
    total,
    queued,
    dialing,
    inCall,
    completed,
    skipped,
    canceled,
    answered,
    failed,
    optOuts,
  ] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: 'queued' } }),
    prisma.campaignRecipient.count({
      where: { campaignId, status: 'dialing' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, status: 'in_call' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, status: 'completed' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, status: 'skipped' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, status: 'canceled' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, deliveryStatus: 'answered' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, deliveryStatus: 'failed' },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, outcome: 'opted_out' },
    }),
  ]);
  return {
    total,
    queued,
    dialing,
    inCall,
    completed,
    skipped,
    canceled,
    answered,
    failed,
    optOuts,
  };
}

export async function refreshCampaignCompletion(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  });
  if (!campaign || campaign.status !== 'running') return;

  const remaining = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: { notIn: FINAL_RECIPIENT_STATUSES },
    },
  });
  if (remaining === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    });
  }
}

export async function markRecipientOptedOut(opts: {
  campaignId: string;
  recipientId: string;
  contactId?: string | null;
  reason: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.update({
      where: { id: opts.recipientId },
      data: {
        status: 'completed',
        deliveryStatus: 'answered',
        outcome: 'opted_out',
        outcomeNotes: opts.reason,
      },
    });
    if (opts.contactId) {
      await tx.contact.update({
        where: { id: opts.contactId },
        data: {
          callConsentStatus: 'opted_out',
          doNotCallAt: new Date(),
          doNotCallReason: opts.reason,
        },
      });
    }
  });
}

export async function finalizeCampaignRecipientFromCall(opts: {
  campaignId: string;
  recipientId: string;
  contactId?: string | null;
  transcript: Array<{ speaker: string; text: string }>;
}) {
  const classified = await classifyCampaignOutcome(opts.transcript);
  await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.update({
      where: { id: opts.recipientId },
      data: {
        status: 'completed',
        deliveryStatus: 'answered',
        outcome: classified.outcome,
        outcomeNotes: classified.notes,
      },
    });
    if (opts.contactId && classified.outcome === 'opted_out') {
      await tx.contact.update({
        where: { id: opts.contactId },
        data: {
          callConsentStatus: 'opted_out',
          doNotCallAt: new Date(),
          doNotCallReason: classified.notes ?? 'Opted out during campaign call',
        },
      });
    }
  });
  await refreshCampaignCompletion(opts.campaignId);
}

export function jsonOrNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
