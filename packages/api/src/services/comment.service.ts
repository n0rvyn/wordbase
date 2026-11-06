import { eq, desc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { comments, posts } from '../db/schema.js';

interface ListCommentsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListAdminCommentsOptions {
  status: 'pending' | 'approved' | 'spam' | 'trash';
  page: number;
  limit: number;
}

/** One global moderation page, including titles without fetching post bodies. */
export async function listAdminComments({ status, page, limit }: ListAdminCommentsOptions) {
  const where = eq(comments.status, status);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(where);
  const data = await db.select({
    id: comments.id,
    postId: comments.postId,
    parentId: comments.parentId,
    authorName: comments.authorName,
    authorEmail: comments.authorEmail,
    authorUrl: comments.authorUrl,
    content: comments.content,
    status: comments.status,
    createdAt: comments.createdAt,
    postTitle: posts.title,
  }).from(comments).innerJoin(posts, eq(comments.postId, posts.id))
    .where(where)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit).offset((page - 1) * limit);

  return { data, total, page, limit };
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

/** Same global pending definition for dashboard, system status and MCP. */
export function getCommentCounts() {
  const rows=db.select({status:comments.status,count:sql<number>`count(*)`}).from(comments).groupBy(comments.status).all();
  return { pending:rows.find(row=>row.status==='pending')?.count ?? 0, total:rows.reduce((sum,row)=>sum+row.count,0) };
}
