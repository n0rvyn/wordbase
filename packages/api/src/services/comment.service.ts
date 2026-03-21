import { eq, desc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { comments, posts } from '../db/schema.js';

interface ListCommentsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listComments(postId: string, options: ListCommentsOptions = {}) {
  const { status = 'approved', page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions = [eq(comments.postId, postId), eq(comments.status, status)];
  const where = and(...conditions);

  const data = await db.select()
    .from(comments)
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, page, limit };
}

export async function getComment(id: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return comment || null;
}

interface CreateCommentData {
  authorName: string;
  authorEmail?: string;
  authorUrl?: string;
  content: string;
  parentId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createComment(postId: string, data: CreateCommentData) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) {
    throw new Error('Post not found');
  }

  if (data.parentId) {
    const [parent] = await db.select().from(comments).where(eq(comments.id, data.parentId)).limit(1);
    if (!parent) {
      throw new Error('Parent comment not found');
    }
  }

  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  const [comment] = await db.insert(comments).values({
    id,
    postId,
    parentId: data.parentId ?? null,
    authorName: data.authorName,
    authorEmail: data.authorEmail ?? null,
    authorUrl: data.authorUrl ?? null,
    content: data.content,
    status: 'pending',
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    createdAt: now,
  }).returning();

  return comment;
}

export async function updateCommentStatus(id: string, status: string) {
  const validStatuses = ['pending', 'approved', 'spam', 'trash'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status');
  }

  const [comment] = await db.update(comments)
    .set({ status })
    .where(eq(comments.id, id))
    .returning();

  return comment || null;
}

export async function deleteComment(id: string) {
  const [deleted] = await db.delete(comments).where(eq(comments.id, id)).returning();
  return deleted || null;
}
