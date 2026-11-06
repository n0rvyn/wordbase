import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { apiKeys, comments, posts } from '../db/schema.js';
import { app } from '../app.js';
import type { listAdminComments } from '../services/comment.service.js';

type CommentPage = Awaited<ReturnType<typeof listAdminComments>>;

const readKey = 'queue-read-fixture';
const deniedKey = 'queue-write-fixture';
const headers = { Authorization: `Bearer ${readKey}` };

beforeAll(async () => {
  for (const [id, key, permissions] of [
    ['queue-read', readKey, ['comments:read']],
    ['queue-write', deniedKey, ['comments:write']],
  ] as const) {
    await db.insert(apiKeys).values({
      id, name: id, keyPrefix: key.slice(0, 8), keyHash: await bcrypt.hash(key, 4),
      permissions: JSON.stringify(permissions), createdAt: 1,
    });
  }
});

beforeEach(async () => {
  await db.delete(comments);
  await db.delete(posts);
  await db.insert(posts).values([
    { id: 'old-draft', slug: 'old-draft', title: 'Old draft title', content: 'Private post body', status: 'draft', createdAt: 1, updatedAt: 1 },
    { id: 'new-post', slug: 'new-post', title: 'New post title', content: 'Published body', status: 'published', createdAt: 2, updatedAt: 2 },
  ]);
  await db.insert(comments).values([
    ...Array.from({ length: 27 }, (_, i) => ({
      id: `pending-${String(i).padStart(2, '0')}`, postId: 'old-draft',
      authorName: 'Reader', authorEmail: 'reader@example.test', content: `Comment ${i}`,
      status: 'pending', createdAt: 100, ipAddress: 'private-ip', userAgent: 'private-agent',
    })),
    ...['approved', 'spam', 'trash'].map(status => ({
      id: status, postId: 'new-post', authorName: 'Other reader', content: status,
      status, createdAt: 200,
    })),
  ]);
});

describe('global admin comments queue', () => {
  it('requires valid authentication and comments:read even for approved comments', async () => {
    for (const suffix of ['', '?status=approved']) {
      expect((await app.request(`/api/comments${suffix}`)).status).toBe(401);
      expect((await app.request(`/api/comments${suffix}`, { headers: { Authorization: 'Bearer invalid-key' } })).status).toBe(401);
      expect((await app.request(`/api/comments${suffix}`, { headers: { Authorization: `Bearer ${deniedKey}` } })).status).toBe(403);
    }
  });

  it('returns every pending comment on an old draft with titles in one request', async () => {
    const response = await app.request('/api/comments', { headers });
    expect(response.status).toBe(200);
    const result = await response.json() as CommentPage;
    expect(result).toMatchObject({ total: 27, page: 1, limit: 50 });
    expect(result.data).toHaveLength(27);
    expect(result.data[0]).toMatchObject({ id: 'pending-26', postId: 'old-draft', postTitle: 'Old draft title', content: 'Comment 26', authorEmail: 'reader@example.test' });
    expect(result.data[0]).not.toHaveProperty('ipAddress');
    expect(result.data[0]).not.toHaveProperty('userAgent');
    expect(JSON.stringify(result)).not.toContain('Private post body');
  });

  it('paginates with stable ordering when timestamps tie and reports the total', async () => {
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await app.request(`/api/comments?status=pending&page=${page}&limit=10`, { headers });
      expect(response.status).toBe(200);
      const result = await response.json() as CommentPage;
      expect(result).toMatchObject({ total: 27, page, limit: 10 });
      ids.push(...result.data.map((c: { id: string }) => c.id));
    }
    expect(ids).toEqual(Array.from({ length: 27 }, (_, i) => `pending-${String(26 - i).padStart(2, '0')}`));
    const beyond = await (await app.request('/api/comments?page=4&limit=10', { headers })).json();
    expect(beyond).toMatchObject({ data: [], total: 27, page: 4, limit: 10 });
  });

  it.each(['approved', 'spam', 'trash'])('isolates the %s queue', async status => {
    const response = await app.request(`/api/comments?status=${status}`, { headers });
    expect(response.status).toBe(200);
    const result = await response.json() as CommentPage;
    expect(result.total).toBe(1);
    expect(result.data.map((c: { status: string }) => c.status)).toEqual([status]);
  });

  it.each(['status=all', 'status=', 'page=0', 'page=-1', 'page=1.5', 'page=abc', 'limit=0', 'limit=101', 'limit=2.5', 'limit=abc', 'page=9007199254740991&limit=100'])('rejects invalid query %s', async query => {
    const response = await app.request(`/api/comments?${query}`, { headers });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });

  it('returns an empty page without manufacturing comments', async () => {
    await db.delete(comments);
    const response = await app.request('/api/comments', { headers });
    expect(await response.json()).toEqual({ data: [], total: 0, page: 1, limit: 50 });
  });

  it('preserves public per-post approved reads and protected pending reads', async () => {
    const approved = await app.request('/api/posts/new-post/comments');
    expect(approved.status).toBe(200);
    const result = await approved.json() as { data: { id: string }[] };
    expect(result.data.map(c => c.id)).toEqual(['approved']);
    expect((await app.request('/api/posts/old-draft/comments?status=pending')).status).toBe(401);
    expect((await app.request('/api/comments/counts', { headers })).status).toBe(200);
  });
});
