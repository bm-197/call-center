import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { stripUndefined } from '../../common/strip-undefined.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const agentInput = z.object({
  name: z.string().min(1).max(120),
  description: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v ?? null),
  language: z.enum(['am', 'en', 'am+en']).default('am'),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  systemPrompt: z.string().default(''),
  llmProvider: z.enum(['openai', 'google']).default('openai'),
  llmModel: z.string().default('gpt-4o'),
  sttProvider: z.enum(['google', 'whisper']).default('google'),
  ttsProvider: z.enum(['google']).default('google'),
  ttsVoice: z.string().default('am-ET-Wavenet-A'),
  handoffEnabled: z.boolean().default(true),
  handoffConfidenceThreshold: z.number().min(0).max(1).default(0.3),
  handoffMaxFailedAttempts: z.number().int().min(1).max(10).default(3),
  handoffMessage: z.string().default(''),
});

router.get('/', async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { organizationId: req.activeOrganizationId! },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(agents);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = agentInput.parse(req.body);
    const agent = await prisma.agent.create({
      data: { ...data, organizationId: req.activeOrganizationId! },
    });
    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
    });
    if (!agent) throw new AppError(404, 'Agent not found');
    res.json(agent);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = agentInput.partial().parse(req.body);
    const existing = await prisma.agent.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Agent not found');

    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: stripUndefined(data),
    });
    res.json(agent);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.agent.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Agent not found');

    await prisma.agent.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as agentRouter };
