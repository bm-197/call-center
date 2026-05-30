import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import {
  executeTool,
  listToolsForAgent,
  setAgentToolGrant,
} from '../../tools/runtime.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const grantInput = z.object({
  status: z.enum(['enabled', 'disabled']),
  config: z.record(z.string(), z.unknown()).optional(),
});

const invocationQuery = z.object({
  callId: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

router.get('/agents/:agentId', async (req, res, next) => {
  try {
    const agentId = param(req.params.agentId);
    await assertAgent(req.activeOrganizationId!, agentId);
    const tools = await listToolsForAgent({
      organizationId: req.activeOrganizationId!,
      agentId,
    });
    res.json(tools);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/agents/:agentId/:toolName',
  requireOrgMember('admin'),
  async (req, res, next) => {
    try {
      const agentId = param(req.params.agentId);
      const toolName = param(req.params.toolName);
      await assertAgent(req.activeOrganizationId!, agentId);
      const input = grantInput.parse(req.body);
      const grant = await setAgentToolGrant({
        organizationId: req.activeOrganizationId!,
        agentId,
        toolName,
        status: input.status,
        config: input.config,
      });
      res.json(grant);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/agents/:agentId/:toolName/test',
  requireOrgMember('admin'),
  async (req, res, next) => {
    try {
      const agentId = param(req.params.agentId);
      const toolName = param(req.params.toolName);
      await assertAgent(req.activeOrganizationId!, agentId);
      const result = await executeTool(toolName, req.body ?? {}, {
        organizationId: req.activeOrganizationId!,
        agentId,
        source: 'api',
        actorId: req.user!.id,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/invocations', async (req, res, next) => {
  try {
    const q = invocationQuery.parse(req.query);
    const where = {
      organizationId: req.activeOrganizationId!,
      ...(q.callId ? { callId: q.callId } : {}),
    };

    const [total, invocations] = await Promise.all([
      prisma.toolInvocation.count({ where }),
      prisma.toolInvocation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({
      items: invocations,
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

async function assertAgent(organizationId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId },
    select: { id: true },
  });
  if (!agent) throw new AppError(404, 'Agent not found');
}

function param(value: string | string[] | undefined): string {
  if (typeof value === 'string' && value) return value;
  throw new AppError(400, 'Missing route parameter');
}

export { router as toolsRouter };
