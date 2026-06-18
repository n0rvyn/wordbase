import { eq, asc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { tags, postTags, posts } from '../db/schema.js';

export async function listTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}

// Phase 3 (Taxonomy over MCP) — join tags with post_tags so the MCP `tag_list`
// tool can show "how many posts use this tag". Read-only helper, lives in the
// service so adapters stay thin (DP-003). LEFT JOIN keeps tag-with-no-posts in
// the result with postCount = 0 instead of dropping them.
export async function listTagsWithCounts() {
  return db
    .select({
      id: tags.id,
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`COUNT(${postTags.postId})`.as('post_count'),
    })
    .from(tags)
    .leftJoin(postTags, eq(postTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
}

// Phase 3 (Taxonomy over MCP) — exact precondition for `tag_update`/`tag_delete`
// to decide whether the static site needs a rebuild. EXISTS(...) over the
// junction × published-posts join lets the adapter avoid blanket builds.
export async function tagUsedByPublished(tagId: string): Promise<boolean> {
  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(sql`${postTags.tagId} = ${tagId} AND ${posts.status} = 'published'`)
    .limit(1);
  return Boolean(row);
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

// Mirror post.service slugify: keep CJK so Chinese tag names get a stable,
// non-empty slug (the old ASCII-only rule collapsed them to '' and collided on
// the unique constraint for the second Chinese tag).
function slugifyTag(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createTag(data: CreateTagData) {
  const slug = data.slug || slugifyTag(data.name) || data.name;
  // Create-or-attach: if a tag with this slug already exists, return it instead
  // of hitting the unique constraint. Lets the editor POST a tag by name
  // idempotently (type-and-Enter reuses an existing tag, doesn't 500 on dupes).
  const [existing] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  if (existing) return existing;

  const id = nanoid();
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