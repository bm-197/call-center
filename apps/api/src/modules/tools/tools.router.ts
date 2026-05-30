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
    const callId =
      typeof req.query.callId === 'string' ? req.query.callId : null;
    const invocations = await prisma.toolInvocation.findMany({
      where: {
        organizationId: req.activeOrganizationId!,
        ...(callId ? { callId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(invocations);
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
