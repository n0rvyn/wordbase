import { eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { categories } from '../db/schema.js';

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

export async function getCategory(idOrSlug: string) {
  const [cat] = await db.select().from(categories).where(eq(categories.id, idOrSlug)).limit(1);
  if (cat) return cat;
  const [bySlug] = await db.select().from(categories).where(eq(categories.slug, idOrSlug)).limit(1);
  return bySlug || null;
}

interface CreateCategoryData {
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
}

export async function createCategory(data: CreateCategoryData) {
  const id = nanoid();
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [cat] = await db.insert(categories).values({
    id,
    slug,
    name: data.name,
    description: data.description ?? null,
    sortOrder: data.sortOrder ?? 0,
  }).returning();
  return cat;
}

export async function updateCategory(id: string, data: Partial<CreateCategoryData>) {
  const updateValues: Record<string, unknown> = {};
  if (data.name !== undefined) updateValues.name = data.name;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;

  const [cat] = await db.update(categories).set(updateValues).where(eq(categories.id, id)).returning();
  return cat || null;
}

export async function deleteCategory(id: string) {
  const [deleted] = await db.delete(categories).where(eq(categories.id, id)).returning();
  return deleted || null;
}
