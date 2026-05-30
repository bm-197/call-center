import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { prisma } from '@call-center/db';
import { dialCampaignRecipient } from '../../realtime/outbound-dialer.js';
import { refreshCampaignCompletion } from './campaign.service.js';

type CampaignJob =
  | { name: 'run-campaign'; data: { campaignId: string } }
  | {
      name: 'recipient-timeout';
      data: { campaignId: string; recipientId: string; callId: string };
    };

let queue: Queue | null = null;
let worker: Worker | null = null;

function redisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

export function getCampaignQueue(): Queue | null {
  if (queue) return queue;
  const connection = redisConnection();
  if (!connection) return null;
  queue = new Queue('campaigns', { connection });
  return queue;
}

export async function enqueueCampaignRun(campaignId: string, delay = 0) {
  const q = getCampaignQueue();
  if (!q) {
    console.warn('[campaign] REDIS_URL missing; campaign runner disabled');
    return;
  }
  await q.add(
    'run-campaign',
    { campaignId },
    { delay, removeOnComplete: true },
  );
}

async function enqueueRecipientTimeout(
  campaignId: string,
  recipientId: string,
  callId: string,
  delayMs: number,
) {
  const q = getCampaignQueue();
  if (!q) return;
  await q.add(
    'recipient-timeout',
    { campaignId, recipientId, callId },
    { delay: delayMs, removeOnComplete: true },
  );
}

export function startCampaignWorker() {
  if (worker) return;
  const connection = redisConnection();
  if (!connection) {
    console.log('[campaign] REDIS_URL missing; campaign worker disabled');
    return;
  }

  worker = new Worker(
    'campaigns',
    async (job: Job<CampaignJob['data']>) => {
      if (job.name === 'run-campaign') {
        await runCampaign((job.data as { campaignId: string }).campaignId);
      } else if (job.name === 'recipient-timeout') {
        await handleRecipientTimeout(
          job.data as {
            campaignId: string;
            recipientId: string;
            callId: string;
          },
        );
      }
    },
    { connection, concurrency: 4 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[campaign] job ${job?.name ?? 'unknown'} failed:`, err);
  });
  console.log('[campaign] worker started');
}

async function runCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      maxConcurrency: true,
      maxAttempts: true,
      retryDelayMinutes: true,
      callTimeoutSeconds: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      timezone: true,
    },
  });
  if (!campaign || campaign.status !== 'running') return;

  if (!isInsideQuietHours(campaign)) {
    await enqueueCampaignRun(campaign.id, 5 * 60_000);
    return;
  }

  const active = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ['dialing', 'in_call'] } },
  });
  const capacity = Math.max(0, campaign.maxConcurrency - active);
  if (capacity === 0) {
    await enqueueCampaignRun(campaign.id, 10_000);
    return;
  }

  const now = new Date();
  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId,
      status: 'queued',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: { contact: true },
    orderBy: { createdAt: 'asc' },
    take: capacity,
  });

  if (recipients.length === 0) {
    await refreshCampaignCompletion(campaignId);
    return;
  }

  for (const recipient of recipients) {
    if (
      recipient.contact?.callConsentStatus !== 'opted_in' ||
      recipient.contact?.doNotCallAt
    ) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'skipped',
          deliveryStatus: 'skipped',
          lastError: 'Contact is not opted in for campaign calls',
        },
      });
      continue;
    }

    const locked = await prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: 'queued' },
      data: {
        status: 'dialing',
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    if (locked.count !== 1) continue;

    try {
      const { callId } = await dialCampaignRecipient({
        campaignId,
        recipientId: recipient.id,
      });
      await enqueueRecipientTimeout(
        campaignId,
        recipient.id,
        callId,
        campaign.callTimeoutSeconds * 1000,
      );
    } catch (err) {
      await markDialFailure({
        campaignId,
        recipientId: recipient.id,
        maxAttempts: campaign.maxAttempts,
        retryDelayMinutes: campaign.retryDelayMinutes,
        message: err instanceof Error ? err.message : 'Dial failed',
      });
    }
  }

  await enqueueCampaignRun(campaignId, 2_000);
}

async function handleRecipientTimeout(opts: {
  campaignId: string;
  recipientId: string;
  callId: string;
}) {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: opts.recipientId },
    include: { campaign: true },
  });
  if (
    !recipient ||
    recipient.campaignId !== opts.campaignId ||
    recipient.status !== 'dialing' ||
    recipient.lastCallId !== opts.callId
  ) {
    return;
  }

  await prisma.call
    .update({
      where: { id: opts.callId },
      data: { status: 'missed', endedAt: new Date() },
    })
    .catch(() => {});

  await markDialFailure({
    campaignId: opts.campaignId,
    recipientId: opts.recipientId,
    maxAttempts: recipient.campaign.maxAttempts,
    retryDelayMinutes: recipient.campaign.retryDelayMinutes,
    message: 'No answer before campaign call timeout',
    deliveryStatus: 'no_answer',
  });
}

async function markDialFailure(opts: {
  campaignId: string;
  recipientId: string;
  maxAttempts: number;
  retryDelayMinutes: number;
  message: string;
  deliveryStatus?: string;
}) {
  const fresh = await prisma.campaignRecipient.findUnique({
    where: { id: opts.recipientId },
    select: { attemptCount: true },
  });
  const attempts = fresh?.attemptCount ?? 1;
  const exhausted = attempts >= opts.maxAttempts;
  await prisma.campaignRecipient.update({
    where: { id: opts.recipientId },
    data: exhausted
      ? {
          status: 'completed',
          deliveryStatus: opts.deliveryStatus ?? 'failed',
          outcome: 'unknown',
          lastError: opts.message,
        }
      : {
          status: 'queued',
          deliveryStatus: opts.deliveryStatus ?? 'failed',
          nextAttemptAt: new Date(Date.now() + opts.retryDelayMinutes * 60_000),
          lastError: opts.message,
        },
  });
  if (exhausted) await refreshCampaignCompletion(opts.campaignId);
  else
    await enqueueCampaignRun(opts.campaignId, opts.retryDelayMinutes * 60_000);
}

function isInsideQuietHours(campaign: {
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
}) {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: campaign.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return time >= campaign.quietHoursStart && time <= campaign.quietHoursEnd;
}
