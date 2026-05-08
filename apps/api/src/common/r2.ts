import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';

/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Two buckets per CLAUDE.md:
 *   - call-recordings: audio recordings of calls
 *   - kb-uploads:      knowledge base file uploads (PDF/DOCX/TXT)
 *
 * Env vars expected:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
 *   R2_BUCKET_RECORDINGS, R2_BUCKET_KB_UPLOADS
 */

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in apps/api/.env',
    );
  }

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export const R2_BUCKETS = {
  recordings: () => process.env.R2_BUCKET_RECORDINGS ?? 'call-recordings',
  kb: () => process.env.R2_BUCKET_KB_UPLOADS ?? 'kb-uploads',
};

export async function r2Put(opts: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
}

export async function r2Delete(bucket: string, key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Multipart streaming upload from a local file path. Uses
 * @aws-sdk/lib-storage so memory usage stays bounded to one part
 * (5MB default) regardless of file size.
 */
export async function r2UploadFile(opts: {
  bucket: string;
  key: string;
  filePath: string;
  contentType: string;
}): Promise<void> {
  const upload = new Upload({
    client: client(),
    params: {
      Bucket: opts.bucket,
      Key: opts.key,
      Body: createReadStream(opts.filePath),
      ContentType: opts.contentType,
    },
  });
  await upload.done();
}

/**
 * Generate a short-lived presigned download URL.
 * Default expires in 15 minutes.
 */
export async function r2PresignGet(
  bucket: string,
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
