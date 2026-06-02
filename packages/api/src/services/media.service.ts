import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { media } from '../db/schema.js';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Upload allow-list: only these media kinds may be stored and later served from
// /uploads/*. An authenticated key must not be able to stash arbitrary bytes
// (HTML/JS/executables) behind a public URL. SVG is intentionally excluded — it
// can carry executable script and would be a stored-XSS vector when served inline.
//
// The on-disk extension is what a static server uses to label a file's
// Content-Type, so the extension is the real control; MIME is validated too. The
// MIME→extension map both (a) gates unknown MIME types and (b) lets us synthesize
// a safe extension when a caller supplies a filename without one (e.g. an MCP
// tool uploading a base64 blob named "episode-1") instead of rejecting it.
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
};
const ALLOWED_UPLOAD_MIME_TYPES = new Set(Object.keys(MIME_TO_EXTENSION));
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',        // images
  'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga',   // audio
]);

// Extract a sanitized, lowercased extension. Stripping every non-alphanumeric
// character neutralizes path traversal ("x.jpg/../../etc") and double-extension
// ("photo.jpg.exe") tricks that the raw original name could otherwise smuggle in.
function getFileExtension(originalName: string): string {
  const dotIndex = originalName.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return originalName.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// Validate an upload against the allow-list and return the extension to store it
// under. A present extension must be allow-listed; the MIME must always be
// allow-listed; an absent extension is derived from the (validated) MIME so legit
// extension-less uploads are not rejected. Throws on anything outside the lists.
function resolveMediaExtension(filename: string, mimeType: string): string {
  const ext = getFileExtension(filename);
  if (ext && !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file extension ".${ext}". Allowed: ${[...ALLOWED_UPLOAD_EXTENSIONS].join(', ')}`
    );
  }
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mime)) {
    throw new Error(
      `Unsupported MIME type "${mimeType || '(none)'}". Allowed: ${[...ALLOWED_UPLOAD_MIME_TYPES].join(', ')}`
    );
  }
  return ext || MIME_TO_EXTENSION[mime];
}

async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}/${month}`;
}

function generateUniqueFilename(originalName: string, ext: string): string {
  const dotIndex = originalName.lastIndexOf('.');
  const baseSource = dotIndex === -1 ? originalName : originalName.slice(0, dotIndex);
  const baseName = baseSource.replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
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
  const ext = resolveMediaExtension(file.name, file.type);
  const limit = options.maxSize ?? MAX_FILE_SIZE;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > limit) {
    throw new Error(`File too large. Maximum size is ${limit / 1024 / 1024}MB`);
  }

  const datePath = getDatePath();
  const filename = generateUniqueFilename(file.name, ext);
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
