import { eq, desc, asc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { podcasts } from '../db/schema.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface ListPodcastsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listPodcasts(options: ListPodcastsOptions = {}) {
  const { status, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const where = status ? eq(podcasts.status, status) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(podcasts)
    .where(where);
  const total = countResult.count;

  const data = await db
    .select()
    .from(podcasts)
    .where(where)
    .orderBy(asc(podcasts.sortOrder), desc(podcasts.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, total, page, limit };
}

export async function getPodcast(idOrSlug: string) {
  const [byId] = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, idOrSlug))
    .limit(1);
  if (byId) return byId;

  const [bySlug] = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.slug, idOrSlug))
    .limit(1);
  return bySlug || null;
}

interface CreatePodcastData {
  title: string;
  slug?: string;
  description?: string;
  coverImage?: string;
  author?: string;
  ownerName?: string;
  ownerEmail?: string;
  language?: string;
  category?: string;
  explicit?: number;
  link?: string;
  copyright?: string;
  status?: string;
  sortOrder?: number;
  meta?: string;
}

export async function createPodcast(data: CreatePodcastData) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const slug = data.slug || slugify(data.title) || id;

  const [show] = await db
    .insert(podcasts)
    .values({
      id,
      slug,
      title: data.title,
      description: data.description ?? null,
      coverImage: data.coverImage ?? null,
      author: data.author ?? null,
      ownerName: data.ownerName ?? null,
      ownerEmail: data.ownerEmail ?? null,
      language: data.language || 'zh-CN',
      category: data.category ?? null,
      explicit: data.explicit ?? 0,
      link: data.link ?? null,
      copyright: data.copyright ?? null,
      status: data.status || 'draft',
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      meta: data.meta ?? null,
    })
    .returning();

  return show;
}

export async function updatePodcast(id: string, data: Partial<CreatePodcastData>) {
  const now = Math.floor(Date.now() / 1000);
  const updateValues: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined) updateValues.title = data.title;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.coverImage !== undefined) updateValues.coverImage = data.coverImage;
  if (data.author !== undefined) updateValues.author = data.author;
  if (data.ownerName !== undefined) updateValues.ownerName = data.ownerName;
  if (data.ownerEmail !== undefined) updateValues.ownerEmail = data.ownerEmail;
  if (data.language !== undefined) updateValues.language = data.language;
  if (data.category !== undefined) updateValues.category = data.category;
  if (data.explicit !== undefined) updateValues.explicit = data.explicit;
  if (data.link !== undefined) updateValues.link = data.link;
  if (data.copyright !== undefined) updateValues.copyright = data.copyright;
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;
  if (data.meta !== undefined) updateValues.meta = data.meta;

  const [show] = await db
    .update(podcasts)
    .set(updateValues)
    .where(eq(podcasts.id, id))
    .returning();

  return show || null;
}

export async function deletePodcast(id: string) {
  const [deleted] = await db.delete(podcasts).where(eq(podcasts.id, id)).returning();
  return deleted || null;
}

export async function publishPodcast(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [show] = await db
    .update(podcasts)
    .set({ status: 'published', updatedAt: now })
    .where(eq(podcasts.id, id))
    .returning();
  return show || null;
}
