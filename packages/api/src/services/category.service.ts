import { eq, asc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { categories, postCategories, posts } from '../db/schema.js';

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

// Phase 3 (Taxonomy over MCP) — categories + post-count join, mirrors
// listTagsWithCounts. Keep adapters thin; the join lives here (DP-003).
export async function listCategoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      sortOrder: categories.sortOrder,
      postCount: sql<number>`COUNT(${postCategories.postId})`.as('post_count'),
    })
    .from(categories)
    .leftJoin(postCategories, eq(postCategories.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));
}

// Phase 3 (Taxonomy over MCP) — category version of tagUsedByPublished.
// Drives the build-decision guard in `category_update`/`category_delete`.
export async function categoryUsedByPublished(categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(postCategories)
    .innerJoin(posts, eq(posts.id, postCategories.postId))
    .where(sql`${postCategories.categoryId} = ${categoryId} AND ${posts.status} = 'published'`)
    .limit(1);
  return Boolean(row);
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

// DP-005: CJK-aware slugify mirrored from tag.service so Chinese category
// names produce a non-empty slug. The old ASCII-only rule collapsed them to
// '' and the second Chinese category collided on the UNIQUE slug constraint.
function slugifyCategory(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createCategory(data: CreateCategoryData) {
  const id = nanoid();
  // Same chain as createTag: explicit slug → derived slug from name → raw name
  // as last-resort fallback (verifier NICE-1; tag.service:33 already had this).
  const slug = data.slug || slugifyCategory(data.name) || data.name;
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