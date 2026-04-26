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

const phoneInput = z.object({
  number: z.string().min(4).max(40),
  friendlyName: z
    .string()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  agentId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  provider: z.enum(['ethiotelecom', 'twilio']).default('ethiotelecom'),
  capabilities: z
    .record(z.string(), z.boolean())
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(['active', 'inactive']).default('active'),
});

router.get('/', async (req, res, next) => {
  try {
    const numbers = await prisma.phoneNumber.findMany({
      where: { organizationId: req.activeOrganizationId! },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(numbers);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = phoneInput.parse(req.body);
    if (data.agentId) {
      const owns = await prisma.agent.findFirst({
        where: { id: data.agentId, organizationId: req.activeOrganizationId! },
        select: { id: true },
      });
      if (!owns)
        throw new AppError(400, 'Agent not found in this organization');
    }
    const number = await prisma.phoneNumber.create({
      data: { ...data, organizationId: req.activeOrganizationId! },
      include: { agent: { select: { id: true, name: true } } },
    });
    res.status(201).json(number);
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      next(new AppError(409, 'This phone number is already registered'));
      return;
    }
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = phoneInput.partial().parse(req.body);
    const existing = await prisma.phoneNumber.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Phone number not found');
    if (data.agentId) {
      const owns = await prisma.agent.findFirst({
        where: { id: data.agentId, organizationId: req.activeOrganizationId! },
        select: { id: true },
      });
      if (!owns)
        throw new AppError(400, 'Agent not found in this organization');
    }
    const number = await prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: stripUndefined(data),
      include: { agent: { select: { id: true, name: true } } },
    });
    res.json(number);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.phoneNumber.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Phone number not found');
    await prisma.phoneNumber.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as phoneNumberRouter };
