import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { db } from '../db/index.js';
import { posts } from '../db/schema.js';
import { createPost } from '../services/post.service.js';

// Mock build.service so creating published posts doesn't trigger a real rebuild.
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: vi.fn().mockResolvedValue(undefined) };
});

const { app } = await import('../app.js');

beforeAll(async () => {
  // No api key seeded — /api/search is public.
});

afterEach(async () => {
  await db.delete(posts);
});

describe('GET /api/search (public, no auth)', () => {
  it('returns published posts matching the query, no Authorization header', async () => {
    const p = await createPost({
      title: '向量数据库入门',
      content: '本文讲向量检索。',
      status: 'published',
    });
    const res = await app.request('/api/search?q=向量');
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ id: string; title: string; snippet: string }> };
    expect(body.results.length).toBe(1);
    expect(body.results[0].id).toBe(p.id);
    expect(body.results[0].title).toBe('向量数据库入门');
  });

  it('returns empty results for empty q without throwing', async () => {
    await createPost({ title: '向量', content: 'x', status: 'published' });
    const res = await app.request('/api/search?q=');
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(body.results).toEqual([]);
  });

  it('does not 500 on LIKE metacharacter input', async () => {
    const res = await app.request('/api/search?q=100%25');
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  });
});
