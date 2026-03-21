import { eq, desc, asc, like, and, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, categories, tags } from '../db/schema.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '');
}

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
  const slug = data.slug || slugify(data.title) || id;

  const [post] = await db.insert(posts).values({
    id,
    slug,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? null,
    coverImage: data.coverImage ?? null,
    status: data.status || 'draft',
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
  if (postData.slug !== undefined) updateValues.slug = postData.slug;
  if (postData.excerpt !== undefined) updateValues.excerpt = postData.excerpt;
  if (postData.coverImage !== undefined) updateValues.coverImage = postData.coverImage;
  if (postData.status !== undefined) updateValues.status = postData.status;
  if (postData.meta !== undefined) updateValues.meta = postData.meta;

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

export async function publishPost(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [post] = await db.update(posts).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(posts.id, id)).returning();
  return post || null;
}

export async function archivePost(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [post] = await db.update(posts).set({ status: 'archived', updatedAt: now }).where(eq(posts.id, id)).returning();
  return post || null;
}
