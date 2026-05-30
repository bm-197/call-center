import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { stripUndefined } from '../../common/strip-undefined.js';
import { parseCsv, hasExplicitConsent } from './csv.js';
import {
  campaignSummary,
  getCampaignOrThrow,
  jsonOrNull,
} from './campaign.service.js';
import { enqueueCampaignRun, getCampaignQueue } from './campaign.queue.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(requireAuth, requireOrgMember());

const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

const optionalNullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : (v ?? null)));

const nullableId = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalNullableId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : (v ?? null)));

const campaignCreateInput = z.object({
  name: z.string().min(1).max(160),
  description: nullableText(500),
  agentId: z.string().min(1),
  phoneNumberId: nullableId,
  openingMessage: z.string().min(1).max(2000),
  campaignPrompt: z.string().max(4000).optional(),
  maxConcurrency: z.number().int().min(1).max(5).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  retryDelayMinutes: z.number().int().min(1).max(1440).optional(),
  callTimeoutSeconds: z.number().int().min(10).max(120).optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().min(1).max(80).optional(),
});

const campaignUpdateInput = z.object({
  name: z.string().min(1).max(160).optional(),
  description: optionalNullableText(500),
  agentId: z.string().min(1).optional(),
  phoneNumberId: optionalNullableId,
  openingMessage: z.string().min(1).max(2000).optional(),
  campaignPrompt: z.string().max(4000).optional(),
  maxConcurrency: z.number().int().min(1).max(5).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  retryDelayMinutes: z.number().int().min(1).max(1440).optional(),
  callTimeoutSeconds: z.number().int().min(10).max(120).optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().min(1).max(80).optional(),
});

const contactAddInput = z.object({
  contactIds: z.array(z.string()).min(1).max(2000),
});

const campaignListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(['draft', 'running', 'paused', 'completed', 'canceled'])
    .optional(),
  search: z.string().max(80).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const q = campaignListQuery.parse(req.query);
    const where = {
      organizationId: req.activeOrganizationId!,
      ...(q.status && { status: q.status }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search } },
          { description: { contains: q.search } },
        ],
      }),
    };
    const include = {
      agent: { select: { id: true, name: true } },
      phoneNumber: { select: { id: true, number: true, friendlyName: true } },
      _count: { select: { recipients: true, calls: true } },
    } as const;

    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({
      items: campaigns,
      pagination: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const data = campaignCreateInput.parse(req.body);
    await assertAgent(req.activeOrganizationId!, data.agentId);
    if (data.phoneNumberId) {
      await assertPhoneNumber(req.activeOrganizationId!, data.phoneNumberId);
    }

    const campaign = await prisma.campaign.create({
      data: {
        ...withCampaignDefaults(data),
        organizationId: req.activeOrganizationId!,
      },
      include: {
        agent: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, number: true, friendlyName: true } },
        _count: { select: { recipients: true, calls: true } },
      },
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    const summary = await campaignSummary(campaign.id);
    res.json({ ...campaign, summary });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const existing = await getCampaignOrThrow(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    if (existing.status === 'running') {
      throw new AppError(409, 'Pause the campaign before editing it');
    }

    const data = campaignUpdateInput.parse(req.body);
    if (data.agentId)
      await assertAgent(req.activeOrganizationId!, data.agentId);
    if (data.phoneNumberId) {
      await assertPhoneNumber(req.activeOrganizationId!, data.phoneNumberId);
    }

    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: stripUndefined(data),
      include: {
        agent: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, number: true, friendlyName: true } },
        _count: { select: { recipients: true, calls: true } },
      },
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/recipients', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            callConsentStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });
    res.json(recipients);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/recipients/contacts',
  requireOrgMember('admin'),
  async (req, res, next) => {
    try {
      const campaign = await getEditableCampaign(
        paramId(req.params.id),
        req.activeOrganizationId!,
      );
      const { contactIds } = contactAddInput.parse(req.body);
      const contacts = await prisma.contact.findMany({
        where: {
          organizationId: req.activeOrganizationId!,
          id: { in: contactIds },
        },
      });

      let added = 0;
      let skipped = 0;
      for (const contact of contacts) {
        if (contact.callConsentStatus !== 'opted_in' || contact.doNotCallAt) {
          skipped++;
          continue;
        }
        const displayName =
          [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
          null;
        try {
          await prisma.campaignRecipient.create({
            data: {
              organizationId: req.activeOrganizationId!,
              campaignId: campaign.id,
              contactId: contact.id,
              phoneNumber: contact.phoneNumber,
              displayName,
              email: contact.email,
              variables: jsonOrNull({
                firstName: contact.firstName ?? '',
                lastName: contact.lastName ?? '',
                email: contact.email ?? '',
              }),
            },
          });
          added++;
        } catch (err) {
          if (isUniqueError(err)) skipped++;
          else throw err;
        }
      }
      res.status(201).json({ added, skipped, totalMatched: contacts.length });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/recipients/upload',
  requireOrgMember('admin'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const campaign = await getEditableCampaign(
        paramId(req.params.id),
        req.activeOrganizationId!,
      );
      if (!req.file) throw new AppError(400, 'No CSV file uploaded');

      const rows = parseCsv(req.file.buffer.toString('utf8'));
      let added = 0;
      let skipped = 0;
      const skippedRows: Array<{ row: number; reason: string }> = [];

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]!;
        const phoneNumber = row.phoneNumber?.trim();
        if (!phoneNumber) {
          skipped++;
          skippedRows.push({ row: index + 2, reason: 'Missing phoneNumber' });
          continue;
        }
        if (!hasExplicitConsent(row.consent)) {
          skipped++;
          skippedRows.push({
            row: index + 2,
            reason: 'Missing explicit consent',
          });
          continue;
        }

        const variables = { ...row };
        delete variables.phoneNumber;
        delete variables.consent;
        const firstName = row.firstName || null;
        const lastName = row.lastName || null;
        const displayName =
          [firstName, lastName].filter(Boolean).join(' ') || null;

        const contact = await prisma.contact.upsert({
          where: {
            organizationId_phoneNumber: {
              organizationId: req.activeOrganizationId!,
              phoneNumber,
            },
          },
          update: {
            firstName,
            lastName,
            email: row.email || null,
            callConsentStatus: 'opted_in',
            callConsentSource: 'campaign_csv',
            callConsentAt: new Date(),
            doNotCallAt: null,
            doNotCallReason: null,
          },
          create: {
            organizationId: req.activeOrganizationId!,
            phoneNumber,
            firstName,
            lastName,
            email: row.email || null,
            callConsentStatus: 'opted_in',
            callConsentSource: 'campaign_csv',
            callConsentAt: new Date(),
          },
        });

        try {
          await prisma.campaignRecipient.create({
            data: {
              organizationId: req.activeOrganizationId!,
              campaignId: campaign.id,
              contactId: contact.id,
              phoneNumber,
              displayName,
              email: row.email || null,
              variables: jsonOrNull(variables),
            },
          });
          added++;
        } catch (err) {
          if (isUniqueError(err)) {
            skipped++;
            skippedRows.push({
              row: index + 2,
              reason: 'Duplicate phone number',
            });
          } else {
            throw err;
          }
        }
      }

      res.status(201).json({ added, skipped, skippedRows });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        next(new AppError(400, err.message));
        return;
      }
      next(err);
    }
  },
);

router.get('/:id/calls', async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    const calls = await prisma.call.findMany({
      where: {
        organizationId: req.activeOrganizationId!,
        campaignId: campaign.id,
      },
      include: {
        contact: true,
        agent: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
    });
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/start', requireOrgMember('admin'), async (req, res, next) => {
  try {
    if (!getCampaignQueue())
      throw new AppError(503, 'Campaign queue is not available');
    const campaign = await getEditableCampaign(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    const recipients = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id, status: 'queued' },
    });
    if (recipients === 0)
      throw new AppError(400, 'Add recipients before starting');

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'running',
        startedAt: campaign.startedAt ?? new Date(),
        completedAt: null,
        canceledAt: null,
      },
    });
    await enqueueCampaignRun(updated.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pause', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrThrow(
      paramId(req.params.id),
      req.activeOrganizationId!,
    );
    if (campaign.status !== 'running')
      throw new AppError(409, 'Campaign is not running');
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'paused' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/resume',
  requireOrgMember('admin'),
  async (req, res, next) => {
    try {
      if (!getCampaignQueue())
        throw new AppError(503, 'Campaign queue is not available');
      const campaign = await getCampaignOrThrow(
        paramId(req.params.id),
        req.activeOrganizationId!,
      );
      if (campaign.status !== 'paused')
        throw new AppError(409, 'Campaign is not paused');
      const updated = await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'running' },
      });
      await enqueueCampaignRun(updated.id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/cancel',
  requireOrgMember('admin'),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignOrThrow(
        paramId(req.params.id),
        req.activeOrganizationId!,
      );
      if (campaign.status === 'completed' || campaign.status === 'canceled') {
        throw new AppError(409, 'Campaign is already finished');
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.campaignRecipient.updateMany({
          where: {
            campaignId: campaign.id,
            status: { notIn: FINAL_STATUSES },
          },
          data: { status: 'canceled' },
        });
        return tx.campaign.update({
          where: { id: campaign.id },
          data: { status: 'canceled', canceledAt: new Date() },
        });
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

async function assertAgent(organizationId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId },
    select: { id: true },
  });
  if (!agent) throw new AppError(400, 'Agent not found in this organization');
}

async function assertPhoneNumber(
  organizationId: string,
  phoneNumberId: string,
) {
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, organizationId },
    select: { id: true },
  });
  if (!phone)
    throw new AppError(400, 'Phone number not found in this organization');
}

async function getEditableCampaign(id: string, organizationId: string) {
  const campaign = await getCampaignOrThrow(id, organizationId);
  if (campaign.status === 'running') {
    throw new AppError(409, 'Pause the campaign before changing recipients');
  }
  if (campaign.status === 'completed' || campaign.status === 'canceled') {
    throw new AppError(409, 'Campaign is already finished');
  }
  return campaign;
}

function withCampaignDefaults(data: z.infer<typeof campaignCreateInput>) {
  return {
    ...data,
    campaignPrompt: data.campaignPrompt ?? '',
    maxConcurrency: data.maxConcurrency ?? 2,
    maxAttempts: data.maxAttempts ?? 2,
    retryDelayMinutes: data.retryDelayMinutes ?? 30,
    callTimeoutSeconds: data.callTimeoutSeconds ?? 30,
    quietHoursStart: data.quietHoursStart ?? '09:00',
    quietHoursEnd: data.quietHoursEnd ?? '18:00',
    timezone: data.timezone ?? 'Africa/Addis_Ababa',
  };
}

function isUniqueError(err: unknown) {
  return (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

const FINAL_STATUSES = ['completed', 'skipped', 'canceled'];

function paramId(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  throw new AppError(400, 'Missing campaign id');
}

export { router as campaignRouter };
