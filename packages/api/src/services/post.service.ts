import { eq, ne, desc, asc, like, and, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, categories, tags } from '../db/schema.js';
import { generateSlug } from '../lib/slug.js';

interface ListPostsOptions {
  status?: string;
  category?: string;
  tag?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export async function listPosts(options: ListPostsOptions = {}) {
  const { status, category, tag, page = 1, limit = 10, search } = options;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(posts.status, status));
  if (search) conditions.push(like(posts.title, `%${search}%`));

  let query = db.select().from(posts);

  if (category) {
    const [cat] = await db.select().from(categories).where(eq(categories.slug, category)).limit(1);
    if (cat) {
      const postIds = await db.select({ postId: postCategories.postId }).from(postCategories).where(eq(postCategories.categoryId, cat.id));
      const ids = postIds.map(p => p.postId);
      if (ids.length > 0) conditions.push(inArray(posts.id, ids));
      else return { data: [], total: 0, page, limit };
    }
  }

  if (tag) {
    const [t] = await db.select().from(tags).where(eq(tags.slug, tag)).limit(1);
    if (t) {
      const postIds = await db.select({ postId: postTags.postId }).from(postTags).where(eq(postTags.tagId, t.id));
      const ids = postIds.map(p => p.postId);
      if (ids.length > 0) conditions.push(inArray(posts.id, ids));
      else return { data: [], total: 0, page, limit };
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(where);
  const total = countResult.count;

  const data = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(limit).offset(offset);

  return { data, total, page, limit };
}

export async function getPost(idOrSlug: string) {
  const [post] = await db.select().from(posts)
    .where(eq(posts.id, idOrSlug))
    .limit(1);

  if (post) return post;

  const [bySlug] = await db.select().from(posts)
    .where(eq(posts.slug, idOrSlug))
    .limit(1);

  return bySlug || null;
}

interface CreatePostData {
  title: string;
  content: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string;
  status?: string;
  categoryIds?: string[];
  tagIds?: string[];
  meta?: string;
}

export async function createPost(data: CreatePostData) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  // SEO-friendly ASCII slug (pinyin for CJK); manual `data.slug` is normalized
  // through the same generator, dedupe against existing slugs, id as last resort.
  const taken = new Set((await db.select({ s: posts.slug }).from(posts)).map(r => r.s));
  const slug = generateSlug(data.slug || data.title, { existing: taken, fallbackId: id });

  const [post] = await db.insert(posts).values({
    id,
    slug,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? null,
    coverImage: data.coverImage ?? null,
    status: data.status || 'draft',
    publishedAt: data.status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
    meta: data.meta ?? null,
  }).returning();

  if (data.categoryIds?.length) {
    await db.insert(postCategories).values(
      data.categoryIds.map(categoryId => ({ postId: id, categoryId }))
    );
  }

  if (data.tagIds?.length) {
    await db.insert(postTags).values(
      data.tagIds.map(tagId => ({ postId: id, tagId }))
    );
  }

  return post;
}

export async function updatePost(id: string, data: Partial<Omit<CreatePostData, 'categoryIds' | 'tagIds'>> & { categoryIds?: string[]; tagIds?: string[] }) {
  const now = Math.floor(Date.now() / 1000);
  const { categoryIds, tagIds, ...postData } = data;

  const updateValues: Record<string, unknown> = { updatedAt: now };
  if (postData.title !== undefined) updateValues.title = postData.title;
  if (postData.content !== undefined) updateValues.content = postData.content;
  // Only an explicitly-provided slug changes the URL (title-only edits keep the
  // slug stable). A provided slug is normalized through the same ASCII generator
  // and deduped against OTHER posts (self-excluded so re-saving isn't bumped to -2).
  if (postData.slug !== undefined) {
    const taken = new Set(
      (await db.select({ s: posts.slug }).from(posts).where(ne(posts.id, id))).map(r => r.s)
    );
    updateValues.slug = generateSlug(postData.slug, { existing: taken, fallbackId: id });
  }
  if (postData.excerpt !== undefined) updateValues.excerpt = postData.excerpt;
  if (postData.coverImage !== undefined) updateValues.coverImage = postData.coverImage;
  if (postData.status !== undefined) updateValues.status = postData.status;
  if (postData.meta !== undefined) updateValues.meta = postData.meta;

  // Stamp publishedAt the first time a post becomes published, without clobbering
  // an existing timestamp on later edits (COALESCE keeps the original publish date).
  if (postData.status === 'published') {
    updateValues.publishedAt = sql`COALESCE(${posts.publishedAt}, ${now})`;
  }

  const [post] = await db.update(posts).set(updateValues).where(eq(posts.id, id)).returning();

  if (categoryIds !== undefined) {
    await db.delete(postCategories).where(eq(postCategories.postId, id));
    if (categoryIds.length > 0) {
      await db.insert(postCategories).values(categoryIds.map(categoryId => ({ postId: id, categoryId })));
    }
  }

  if (tagIds !== undefined) {
    await db.delete(postTags).where(eq(postTags.postId, id));
    if (tagIds.length > 0) {
      await db.insert(postTags).values(tagIds.map(tagId => ({ postId: id, tagId })));
    }
  }

  return post || null;
}

export async function deletePost(id: string) {
  const [deleted] = await db.delete(posts).where(eq(posts.id, id)).returning();
  return deleted || null;
}

export async function getPostWithTerms(idOrSlug: string) {
  const post = await getPost(idOrSlug);
  if (!post) return null;
  const tagRows = await db.select({ id: tags.id, slug: tags.slug, name: tags.name })
    .from(postTags).innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, post.id));
  const catRows = await db.select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(postCategories).innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(eq(postCategories.postId, post.id));
  return { ...post, tags: tagRows, categories: catRows };
}

export async function publishPost(id: string) {
  const now = Math.floor(Date.now() / 1000);
  // COALESCE preserves an already-set publishedAt (imported posts, re-publishes),
  // matching publishEpisode and updatePost's stamp-on-first-publish semantics.
  const [post] = await db.update(posts).set({ status: 'published', publishedAt: sql`COALESCE(${posts.publishedAt}, ${now})`, updatedAt: now }).where(eq(posts.id, id)).returning();
  return post || null;
}

export async function archivePost(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [post] = await db.update(posts).set({ status: 'archived', updatedAt: now }).where(eq(posts.id, id)).returning();
  return post || null;
}
