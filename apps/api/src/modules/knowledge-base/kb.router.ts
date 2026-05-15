import { Router } from 'express';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { stripUndefined } from '../../common/strip-undefined.js';
import { R2_BUCKETS, r2Delete, r2Put } from '../../common/r2.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are accepted right now.'));
  },
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sourceCreate = z
  .object({
    name: z.string().min(1).max(160),
    description: z
      .string()
      .max(500)
      .nullish()
      .transform((v) => v ?? null),
    language: z.enum(['am', 'en']).default('am'),
    sourceType: z.enum(['text', 'faq', 'url']).default('text'),
    sourceContent: z.string().max(200_000).nullish(),
    sourceUrl: z.string().url().nullish(),
    agentId: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine(
    (data) => {
      if (data.sourceType === 'url') return !!data.sourceUrl;
      return !!data.sourceContent;
    },
    { message: 'sourceContent (text/faq) or sourceUrl (url) is required' },
  );

const sourceUpdate = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v ?? null),
  language: z.enum(['am', 'en']).optional(),
  sourceContent: z.string().max(200_000).nullish(),
  sourceUrl: z.string().url().nullish(),
  agentId: z
    .string()
    .nullish()
    .transform((v) => v ?? null)
    .optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourceReadyData(content: string | null | undefined) {
  const clean = content?.trim() ?? '';
  return {
    status: 'completed',
    errorMessage: null,
    chunkCount: clean ? 1 : 0,
    tokenCount: estimateTokenCount(clean),
  };
}

function estimateTokenCount(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // unpdf wraps PDF.js for pure-Node ESM use. Returns merged text from all pages.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const sources = await prisma.knowledgeSource.findMany({
      where: { organizationId: req.activeOrganizationId! },
      orderBy: { updatedAt: 'desc' },
      include: { agent: { select: { id: true, name: true } } },
    });
    res.json(sources);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      include: { agent: { select: { id: true, name: true } } },
    });
    if (!source) throw new AppError(404, 'Knowledge source not found');
    res.json(source);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = sourceCreate.parse(req.body);

    if (data.sourceType === 'url') {
      throw new AppError(
        501,
        'URL knowledge sources are not yet supported. Paste the text content for now.',
      );
    }
    if (data.agentId) {
      const owns = await prisma.agent.findFirst({
        where: { id: data.agentId, organizationId: req.activeOrganizationId! },
        select: { id: true },
      });
      if (!owns)
        throw new AppError(400, 'Agent not found in this organization');
    }

    const created = await prisma.knowledgeSource.create({
      data: {
        organizationId: req.activeOrganizationId!,
        name: data.name,
        description: data.description,
        language: data.language,
        sourceType: data.sourceType,
        sourceContent: data.sourceContent ?? null,
        sourceUrl: data.sourceUrl ?? null,
        agentId: data.agentId,
        ...sourceReadyData(data.sourceContent),
      },
      include: { agent: { select: { id: true, name: true } } },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');

    const name =
      (req.body?.name as string | undefined)?.trim() || req.file.originalname;
    const description =
      (req.body?.description as string | undefined)?.trim() || null;
    const language = (req.body?.language as 'am' | 'en' | undefined) ?? 'am';
    const agentId = (req.body?.agentId as string | undefined) || null;

    if (agentId) {
      const owns = await prisma.agent.findFirst({
        where: { id: agentId, organizationId: req.activeOrganizationId! },
        select: { id: true },
      });
      if (!owns)
        throw new AppError(400, 'Agent not found in this organization');
    }

    // 1. Extract text first so we can fail fast if the PDF is bad.
    const text = await extractPdfText(req.file.buffer);
    if (text.trim().length === 0) {
      throw new AppError(
        400,
        'Could not extract text from this PDF. It may be scanned or image-only.',
      );
    }

    // 2. Create the row so we have an id for the R2 key.
    const created = await prisma.knowledgeSource.create({
      data: {
        organizationId: req.activeOrganizationId!,
        name,
        description,
        language,
        sourceType: 'file',
        sourceContent: text,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        agentId,
        status: 'processing',
      },
    });

    try {
      // 3. Upload PDF to R2 keyed by org/source id.
      const key = `${req.activeOrganizationId!}/${created.id}.pdf`;
      await r2Put({
        bucket: R2_BUCKETS.kb(),
        key,
        body: req.file.buffer,
        contentType: 'application/pdf',
      });

      // 4. Save the R2 key as fileUrl for later download.
      await prisma.knowledgeSource.update({
        where: { id: created.id },
        data: { fileUrl: key },
      });

      // 5. Make the extracted text available to Gemini Live context.
      const final = await prisma.knowledgeSource.update({
        where: { id: created.id },
        data: { ...sourceReadyData(text) },
        include: { agent: { select: { id: true, name: true } } },
      });
      res.status(201).json(final);
    } catch (err) {
      await prisma.knowledgeSource
        .update({
          where: { id: created.id },
          data: {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Upload failed',
          },
        })
        .catch(() => {});
      throw err;
    }
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, 'File too large. Max 25 MB.'));
        return;
      }
      next(new AppError(400, err.message));
      return;
    }
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = sourceUpdate.parse(req.body);
    const existing = await prisma.knowledgeSource.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
    });
    if (!existing) throw new AppError(404, 'Knowledge source not found');

    if (data.agentId) {
      const owns = await prisma.agent.findFirst({
        where: { id: data.agentId, organizationId: req.activeOrganizationId! },
        select: { id: true },
      });
      if (!owns)
        throw new AppError(400, 'Agent not found in this organization');
    }

    const contentChanged =
      data.sourceContent !== undefined &&
      data.sourceContent !== existing.sourceContent;

    const updated = await prisma.knowledgeSource.update({
      where: { id: req.params.id },
      data: {
        ...stripUndefined(data),
        ...(contentChanged && sourceReadyData(data.sourceContent)),
      },
    });

    const fresh = await prisma.knowledgeSource.findUnique({
      where: { id: updated.id },
      include: { agent: { select: { id: true, name: true } } },
    });
    res.json(fresh);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reindex', async (req, res, next) => {
  try {
    const existing = await prisma.knowledgeSource.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
    });
    if (!existing) throw new AppError(404, 'Knowledge source not found');
    if (!existing.sourceContent) {
      throw new AppError(
        400,
        'No content to reindex. Update the source first.',
      );
    }

    const final = await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: sourceReadyData(existing.sourceContent),
      include: { agent: { select: { id: true, name: true } } },
    });

    res.json(final);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.knowledgeSource.findFirst({
      where: { id: req.params.id, organizationId: req.activeOrganizationId! },
      select: { id: true, fileUrl: true },
    });
    if (!existing) throw new AppError(404, 'Knowledge source not found');

    if (existing.fileUrl) {
      await r2Delete(R2_BUCKETS.kb(), existing.fileUrl).catch(() => {});
    }
    await prisma.knowledgeSource.delete({ where: { id: existing.id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as knowledgeBaseRouter };
