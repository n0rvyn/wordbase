import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { media } from '../db/schema.js';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}/${month}`;
}

function generateUniqueFilename(originalName: string): string {
  const dotIndex = originalName.lastIndexOf('.');
  if (dotIndex === -1) {
    return `${originalName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${nanoid(8)}`;
  }
  const ext = originalName.slice(dotIndex + 1);
  const baseName = originalName.slice(0, dotIndex).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${baseName}_${nanoid(8)}.${ext}`;
}

interface UploadOptions {
  file: File | { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
  altText?: string;
  maxSize?: number;
}

export function podcastAudioMaxBytes(): number {
  return parseInt(process.env.PODCAST_MAX_AUDIO_MB || '200', 10) * 1024 * 1024;
}

export async function uploadMedia(options: UploadOptions) {
  await ensureUploadsDir();

  const { file, altText } = options;
  const limit = options.maxSize ?? MAX_FILE_SIZE;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > limit) {
    throw new Error(`File too large. Maximum size is ${limit / 1024 / 1024}MB`);
  }

  const datePath = getDatePath();
  const filename = generateUniqueFilename(file.name);
  const relativePath = `${datePath}/${filename}`;
  const fullPath = join(UPLOADS_DIR, relativePath);

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(media).values({
    id: nanoid(),
    filename: file.name,
    path: relativePath,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
    altText: altText || null,
    createdAt: now,
  }).returning();

  return { ...record, url: `/uploads/${relativePath}` };
}

export async function listMedia(options: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(media);
  const total = countResult.count;
  const data = await db.select().from(media).orderBy(desc(media.createdAt)).limit(limit).offset(offset);

  return { data: data.map(d => ({ ...d, url: `/uploads/${d.path}` })), total, page, limit };
}

export async function getMedia(id: string) {
  const [record] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!record) return null;
  return { ...record, url: `/uploads/${record.path}` };
}

export async function deleteMedia(id: string) {
  const [record] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!record) return null;

  try {
    const fullPath = join(UPLOADS_DIR, record.path);
    await unlink(fullPath);
  } catch {
    console.warn('Failed to delete file from disk');
  }

  const [deleted] = await db.delete(media).where(eq(media.id, id)).returning();
  return deleted || null;
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
