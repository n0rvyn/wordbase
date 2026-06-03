import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, posts, tags, postTags } from '../db/schema.js';

type AnyObj = Record<string, unknown>;

// Mock build.service before importing app so we can assert rebuild triggers.
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

const { app } = await import('../app.js');
const { triggerBuild } = await import('../services/build.service.js');
const triggerBuildSpy = triggerBuild as ReturnType<typeof vi.fn>;

let rawKey: string;

async function seedApiKey() {
  rawKey = 'testkey-posttags';
  const now = Math.floor(Date.now() / 1000);
  await db.insert(apiKeys).values({
    id: nanoid(),
    name: 'Test Key',
    keyPrefix: rawKey.slice(0, 8),
    keyHash: await bcrypt.hash(rawKey, 10),
    permissions: '["*"]',
    createdAt: now,
  }).onConflictDoNothing();
}

function authHeaders() {
  return { Authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' };
}

beforeAll(async () => {
  await seedApiKey();
});

afterEach(async () => {
  await db.delete(postTags);
  await db.delete(posts);
  await db.delete(tags);
  triggerBuildSpy.mockClear();
});

describe('publishedAt stamping + rebuild on the Save path (issue #2)', () => {
  it('PUT status=published stamps publishedAt and triggers a rebuild', async () => {
    const created = await app.request('/api/posts', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Draft first', content: 'body', status: 'draft' }),
    });
    const draft = await created.json() as AnyObj;
    expect(draft.publishedAt).toBeNull();
    triggerBuildSpy.mockClear(); // draft create must not have triggered

    const res = await app.request(`/api/posts/${draft.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status: 'published' }),
    });
    const updated = await res.json() as AnyObj;
    expect(res.status).toBe(200);
    expect(updated.status).toBe('published');
    expect(updated.publishedAt).toBeGreaterThan(0);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('POST status=published stamps publishedAt and triggers a rebuild', async () => {
    const res = await app.request('/api/posts', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Born published', content: 'body', status: 'published' }),
    });
    const post = await res.json() as AnyObj;
    expect(res.status).toBe(201);
    expect(post.publishedAt).toBeGreaterThan(0);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('re-saving an already-published post keeps the original publishedAt', async () => {
    const created = await app.request('/api/posts', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Pub', content: 'body', status: 'published' }),
    });
    const post = await created.json() as AnyObj;
    const firstPublishedAt = post.publishedAt as number;

    const res = await app.request(`/api/posts/${post.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ title: 'Pub edited', status: 'published' }),
    });
    const updated = await res.json() as AnyObj;
    expect(updated.publishedAt).toBe(firstPublishedAt);
  });

  it('plain draft edits do NOT trigger a rebuild', async () => {
    const created = await app.request('/api/posts', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Draft', content: 'body', status: 'draft' }),
    });
    const post = await created.json() as AnyObj;
    triggerBuildSpy.mockClear();

    await app.request(`/api/posts/${post.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ title: 'Draft edited', status: 'draft' }),
    });
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('unpublishing a published post (PUT to draft) triggers a rebuild so the site drops it', async () => {
    const created = await app.request('/api/posts', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Pub', content: 'body', status: 'published' }),
    });
    const post = await created.json() as AnyObj;
    triggerBuildSpy.mockClear();

    await app.request(`/api/posts/${post.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status: 'draft' }),
    });
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });
});

describe('tag create-or-attach with CJK slugs (issue #3)', () => {
  it('creates a Chinese-named tag with a non-empty, name-based slug', async () => {
    const res = await app.request('/api/tags', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: '个体' }),
    });
    const tag = await res.json() as AnyObj;
    expect(res.status).toBe(201);
    expect(tag.slug).toBe('个体');
  });

  it('two different Chinese tags do not collide on the unique slug constraint', async () => {
    const a = await app.request('/api/tags', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: '群体' }),
    });
    const b = await app.request('/api/tags', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: '心理学' }),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ta = await a.json() as AnyObj;
    const tb = await b.json() as AnyObj;
    expect(ta.slug).toBe('群体');
    expect(tb.slug).toBe('心理学');
    expect(ta.id).not.toBe(tb.id);
  });

  it('posting a duplicate name returns the existing tag instead of 500ing', async () => {
    const first = await app.request('/api/tags', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: '语言模型' }),
    });
    const firstTag = await first.json() as AnyObj;

    const second = await app.request('/api/tags', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: '语言模型' }),
    });
    const secondTag = await second.json() as AnyObj;
    expect(second.status).toBe(201);
    expect(secondTag.id).toBe(firstTag.id);
  });
});
