import { eq, ne, asc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { pages } from '../db/schema.js';
import { generateSlug } from '../lib/slug.js';

export async function listPages(options: { status?: string } = {}) {
  const where = options.status ? eq(pages.status, options.status) : undefined;
  return db.select().from(pages).where(where).orderBy(asc(pages.sortOrder));
}

export async function getPage(idOrSlug: string) {
  const [page] = await db.select().from(pages).where(eq(pages.id, idOrSlug)).limit(1);
  if (page) return page;
  const [bySlug] = await db.select().from(pages).where(eq(pages.slug, idOrSlug)).limit(1);
  return bySlug || null;
}

interface CreatePageData {
  title: string;
  slug?: string;
  content: string;
  sortOrder?: number;
  status?: string;
  meta?: string;
}

export async function createPage(data: CreatePageData) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  // SEO-friendly ASCII slug (pinyin for CJK); a manual `data.slug` is normalized
  // through the same generator and deduped against existing slugs (collision -> -2).
  const taken = new Set((await db.select({ s: pages.slug }).from(pages)).map(r => r.s));
  const slug = generateSlug(data.slug || data.title, { existing: taken, fallbackId: id });

  const [page] = await db.insert(pages).values({
    id,
    slug,
    title: data.title,
    content: data.content,
    sortOrder: data.sortOrder ?? 0,
    status: data.status || 'draft',
    meta: data.meta ?? null,
    publishedAt: data.status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return page;
}

export async function updatePage(id: string, data: Partial<CreatePageData>) {
  const now = Math.floor(Date.now() / 1000);
  const updateValues: Record<string, unknown> = { updatedAt: now };
  if (data.title !== undefined) updateValues.title = data.title;
  // Only an explicitly-provided slug changes the URL; it is normalized through the
  // same generator and deduped against OTHER pages (self-excluded so re-saving the
  // same slug isn't bumped to -2).
  if (data.slug !== undefined) {
    const taken = new Set(
      (await db.select({ s: pages.slug }).from(pages).where(ne(pages.id, id))).map(r => r.s)
    );
    updateValues.slug = generateSlug(data.slug, { existing: taken, fallbackId: id });
  }
  if (data.content !== undefined) updateValues.content = data.content;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.meta !== undefined) updateValues.meta = data.meta;
  // Stamp publishedAt the first time the page becomes published, preserving the
  // original date on later edits (COALESCE keeps the existing timestamp).
  if (data.status === 'published') {
    updateValues.publishedAt = sql`COALESCE(${pages.publishedAt}, ${now})`;
  }

  const [page] = await db.update(pages).set(updateValues).where(eq(pages.id, id)).returning();
  return page || null;
}

export async function deletePage(id: string) {
  const [deleted] = await db.delete(pages).where(eq(pages.id, id)).returning();
  return deleted || null;
}

export async function publishPage(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [page] = await db
    .update(pages)
    .set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(pages.id, id))
    .returning();
  return page || null;
}
