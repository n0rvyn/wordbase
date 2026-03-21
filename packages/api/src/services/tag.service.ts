import { eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { tags } from '../db/schema.js';

export async function listTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function getTag(idOrSlug: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.id, idOrSlug)).limit(1);
  if (tag) return tag;
  const [bySlug] = await db.select().from(tags).where(eq(tags.slug, idOrSlug)).limit(1);
  return bySlug || null;
}

interface CreateTagData {
  name: string;
  slug?: string;
}

export async function createTag(data: CreateTagData) {
  const id = nanoid();
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [tag] = await db.insert(tags).values({
    id,
    slug,
    name: data.name,
  }).returning();
  return tag;
}

export async function updateTag(id: string, data: Partial<CreateTagData>) {
  const updateValues: Record<string, unknown> = {};
  if (data.name !== undefined) updateValues.name = data.name;
  if (data.slug !== undefined) updateValues.slug = data.slug;

  const [tag] = await db.update(tags).set(updateValues).where(eq(tags.id, id)).returning();
  return tag || null;
}

export async function deleteTag(id: string) {
  const [deleted] = await db.delete(tags).where(eq(tags.id, id)).returning();
  return deleted || null;
}
