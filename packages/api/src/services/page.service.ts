import { eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { pages } from '../db/schema.js';

export async function listPages() {
  return db.select().from(pages).orderBy(asc(pages.sortOrder));
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
  const slug = data.slug || data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const [page] = await db.insert(pages).values({
    id,
    slug,
    title: data.title,
    content: data.content,
    sortOrder: data.sortOrder ?? 0,
    status: data.status || 'draft',
    meta: data.meta ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return page;
}

export async function updatePage(id: string, data: Partial<CreatePageData>) {
  const now = Math.floor(Date.now() / 1000);
  const updateValues: Record<string, unknown> = { updatedAt: now };
  if (data.title !== undefined) updateValues.title = data.title;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.content !== undefined) updateValues.content = data.content;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.meta !== undefined) updateValues.meta = data.meta;

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
    .set({ status: 'published', updatedAt: now })
    .where(eq(pages.id, id))
    .returning();
  return page || null;
}
