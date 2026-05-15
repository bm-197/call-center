import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const integrationInput = z.object({
  provider: z.enum(['google_calendar', 'notion', 'custom_api', 'mcp']),
  name: z.string().min(1).max(120).default('default'),
  status: z.enum(['inactive', 'active', 'error']).default('active'),
  config: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const integrations = await prisma.integrationConnection.findMany({
      where: { organizationId: req.activeOrganizationId! },
      orderBy: [{ provider: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json(integrations.map(serializeIntegration));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const input = integrationInput.parse(req.body);
    const integration = await prisma.integrationConnection.upsert({
      where: {
        organizationId_provider_name: {
          organizationId: req.activeOrganizationId!,
          provider: input.provider,
          name: input.name,
        },
      },
      update: {
        status: input.status,
        errorMessage: null,
        config: toInputJson(input.config ?? {}),
        credentials: toInputJson(input.credentials ?? {}),
      },
      create: {
        organizationId: req.activeOrganizationId!,
        provider: input.provider,
        name: input.name,
        status: input.status,
        config: toInputJson(input.config ?? {}),
        credentials: toInputJson(input.credentials ?? {}),
      },
    });
    res.status(201).json(serializeIntegration(integration));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const integration = await prisma.integrationConnection.findFirst({
      where: { id, organizationId: req.activeOrganizationId! },
    });
    if (!integration) throw new AppError(404, 'Integration not found');
    res.json(serializeIntegration(integration));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = integrationInput.partial().parse(req.body);
    const existing = await prisma.integrationConnection.findFirst({
      where: { id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Integration not found');

    const integration = await prisma.integrationConnection.update({
      where: { id },
      data: {
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.config !== undefined
          ? { config: toInputJson(input.config) }
          : {}),
        ...(input.credentials !== undefined
          ? { credentials: toInputJson(input.credentials) }
          : {}),
      },
    });
    res.json(serializeIntegration(integration));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireOrgMember('admin'), async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const existing = await prisma.integrationConnection.findFirst({
      where: { id, organizationId: req.activeOrganizationId! },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Integration not found');

    await prisma.integrationConnection.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

function serializeIntegration(integration: {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  status: string;
  config: Prisma.JsonValue | null;
  credentials: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...integration,
    credentials: maskCredentials(integration.credentials),
  };
}

function maskCredentials(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [
      key,
      typeof item === 'string' && item ? '********' : item,
    ]),
  );
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function param(value: string | string[] | undefined): string {
  if (typeof value === 'string' && value) return value;
  throw new AppError(400, 'Missing route parameter');
}

export { router as integrationRouter };
