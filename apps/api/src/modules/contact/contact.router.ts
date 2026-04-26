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

const contactInput = z.object({
  firstName: z
    .string()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  lastName: z
    .string()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  email: z
    .union([z.string().email(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  phoneNumber: z.string().min(1).max(40),
  countryCode: z.string().default('+251'),
  notes: z
    .string()
    .max(1000)
    .nullish()
    .transform((v) => v ?? null),
});

router.get('/', async (req, res, next) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { organizationId: req.activeOrganizationId! },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json(contacts);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = contactInput.parse(req.body);
    const contact = await prisma.contact.create({
      data: { ...data, organizationId: req.activeOrganizationId! },
    });
    res.status(201).json(contact);
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      next(
        new AppError(409, 'A contact with this phone number already exists'),
      );
      return;
    }
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
    });
    if (!contact) throw new AppError(404, 'Contact not found');
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = contactInput.partial().parse(req.body);
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Contact not found');

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: stripUndefined(data),
    });
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Contact not found');

    await prisma.contact.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as contactRouter };
