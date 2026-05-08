import { Router } from 'express';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { prisma } from '@call-center/db';
import { chunkText, normalizeAmharic } from '@call-center/amharic';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { stripUndefined } from '../../common/strip-undefined.js';
import { R2_BUCKETS, r2Delete, r2Put } from '../../common/r2.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:4003';

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

async function ingestToRag(
  sourceId: string,
  content: string,
): Promise<{ chunks: number }> {
  const normalized = normalizeAmharic(content);
  const chunks = chunkText(normalized, {
    targetSize: 800,
    maxSize: 1200,
    overlap: 150,
  });

  if (chunks.length === 0) {
    throw new AppError(400, 'Content produced no chunks. Add more text.');
  }

  const res = await fetch(`${RAG_SERVICE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: sourceId,
      chunks: chunks.map((c) => ({
        text: c.text,
        metadata: { index: c.index, start: c.start, end: c.end },
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(502, `RAG ingest failed: ${body || res.statusText}`);
  }

  const data = (await res.json()) as { chunks: number };
  return { chunks: data.chunks };
}

async function deleteFromRag(sourceId: string): Promise<void> {
  await fetch(`${RAG_SERVICE_URL}/source/${sourceId}`, {
    method: 'DELETE',
  }).catch(() => {
    // best effort — DB cascade also removes chunks
  });
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
        status: 'processing',
      },
    });

    try {
      const { chunks } = await ingestToRag(created.id, data.sourceContent!);
      const final = await prisma.knowledgeSource.findUnique({
        where: { id: created.id },
        include: { agent: { select: { id: true, name: true } } },
      });
      res.status(201).json({ ...final, chunkCount: chunks });
    } catch (err) {
      await prisma.knowledgeSource
        .update({
          where: { id: created.id },
          data: {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Ingest failed',
          },
        })
        .catch(() => {});
      throw err;
    }
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

      // 5. Chunk + ingest into RAG.
      const { chunks } = await ingestToRag(created.id, text);

      const final = await prisma.knowledgeSource.findUnique({
        where: { id: created.id },
        include: { agent: { select: { id: true, name: true } } },
      });
      res.status(201).json({ ...final, chunkCount: chunks });
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
        ...(contentChanged && { status: 'processing' }),
      },
    });

    if (contentChanged && data.sourceContent) {
      try {
        await ingestToRag(updated.id, data.sourceContent);
        const final = await prisma.knowledgeSource.findUnique({
          where: { id: updated.id },
          include: { agent: { select: { id: true, name: true } } },
        });
        res.json(final);
        return;
      } catch (err) {
        await prisma.knowledgeSource
          .update({
            where: { id: updated.id },
            data: {
              status: 'failed',
              errorMessage:
                err instanceof Error ? err.message : 'Ingest failed',
            },
          })
          .catch(() => {});
        throw err;
      }
    }

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

    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: { status: 'processing', errorMessage: null },
    });

    try {
      const { chunks } = await ingestToRag(existing.id, existing.sourceContent);
      const final = await prisma.knowledgeSource.findUnique({
        where: { id: existing.id },
        include: { agent: { select: { id: true, name: true } } },
      });
      res.json({ ...final, chunkCount: chunks });
    } catch (err) {
      await prisma.knowledgeSource
        .update({
          where: { id: existing.id },
          data: {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Ingest failed',
          },
        })
        .catch(() => {});
      throw err;
    }
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

    await deleteFromRag(existing.id);
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
