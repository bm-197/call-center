import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { R2_BUCKETS, r2PresignGet } from '../../common/r2.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const listQuery = z.object({
  status: z
    .enum([
      'ringing',
      'in_progress',
      'ai_handling',
      'queued',
      'human_handling',
      'completed',
      'failed',
      'missed',
    ])
    .optional(),
  agentId: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  handedOff: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);

    const where = {
      organizationId: req.activeOrganizationId!,
      ...(q.status && { status: q.status }),
      ...(q.agentId && { agentId: q.agentId }),
      ...(q.direction && { direction: q.direction }),
      ...(q.handedOff !== undefined && { handedOff: q.handedOff }),
      ...(q.search && {
        OR: [
          { callerNumber: { contains: q.search } },
          { calleeNumber: { contains: q.search } },
        ],
      }),
    };

    const select = {
      id: true,
      direction: true,
      callerNumber: true,
      calleeNumber: true,
      status: true,
      duration: true,
      handedOff: true,
      handoffReason: true,
      sentiment: true,
      startedAt: true,
      endedAt: true,
      agent: { select: { id: true, name: true } },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
    } as const;

    if (q.cursor) {
      const calls = await prisma.call.findMany({
        where,
        take: q.limit + 1,
        cursor: { id: q.cursor },
        skip: 1,
        orderBy: { startedAt: 'desc' },
        select,
      });

      const hasMore = calls.length > q.limit;
      const items = hasMore ? calls.slice(0, q.limit) : calls;
      const last = items[items.length - 1];
      res.json({
        items,
        nextCursor: hasMore && last ? last.id : null,
        pagination: null,
      });
      return;
    }

    const pageSize = q.pageSize ?? q.limit;
    const [total, calls] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.findMany({
        where,
        skip: (q.page - 1) * pageSize,
        take: pageSize,
        orderBy: { startedAt: 'desc' },
        select,
      }),
    ]);

    res.json({
      items: calls,
      nextCursor: null,
      pagination: {
        page: q.page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const orgId = req.activeOrganizationId!;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [today, active, handedOff, completed] = await Promise.all([
      prisma.call.count({
        where: { organizationId: orgId, startedAt: { gte: startOfToday } },
      }),
      prisma.call.count({
        where: {
          organizationId: orgId,
          status: {
            in: ['ringing', 'in_progress', 'ai_handling', 'human_handling'],
          },
        },
      }),
      prisma.call.count({
        where: {
          organizationId: orgId,
          handedOff: true,
          startedAt: { gte: startOfToday },
        },
      }),
      prisma.call.aggregate({
        where: {
          organizationId: orgId,
          status: 'completed',
          startedAt: { gte: startOfToday },
          duration: { not: null },
        },
        _avg: { duration: true },
      }),
    ]);

    res.json({
      callsToday: today,
      activeNow: active,
      handedOffToday: handedOff,
      avgDurationSeconds: completed._avg.duration ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const call = await prisma.call.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      include: {
        agent: { select: { id: true, name: true } },
        contact: true,
      },
    });
    if (!call) throw new AppError(404, 'Call not found');
    res.json(call);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/recording', async (req, res, next) => {
  try {
    const call = await prisma.call.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { recordingUrl: true },
    });
    if (!call) throw new AppError(404, 'Call not found');
    if (!call.recordingUrl)
      throw new AppError(404, 'No recording for this call');

    const url = await r2PresignGet(
      R2_BUCKETS.recordings(),
      call.recordingUrl,
      600,
    );
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

export { router as callRouter };
