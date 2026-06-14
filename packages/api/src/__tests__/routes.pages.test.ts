import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, pages } from '../db/schema.js';

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
  rawKey = 'testkey-pages';
  const now = Math.floor(Date.now() / 1000);
  await db.insert(apiKeys).values({
    id: nanoid(),
    name: 'Test Key Pages',
    keyPrefix: rawKey.slice(0, 8),
    keyHash: await bcrypt.hash(rawKey, 10),
    permissions: '["*"]',
    createdAt: now,
  }).onConflictDoNothing();
}

function authHeaders() {
  return { Authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' };
}

async function createPage(body: AnyObj) {
  const res = await app.request('/api/pages', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  });
  return { res, page: await res.json() as AnyObj };
}

beforeAll(async () => {
  await seedApiKey();
});

afterEach(async () => {
  await db.delete(pages);
  triggerBuildSpy.mockClear();
});

describe('routes/pages — rebuild on publish-visibility change (完备)', () => {
  it('POST published → 201 + rebuild', async () => {
    const { res } = await createPage({ title: 'Privacy', content: 'x', status: 'published' });
    expect(res.status).toBe(201);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('POST draft → 201 + NO rebuild', async () => {
    const { res } = await createPage({ title: 'Draft Page', content: 'x' });
    expect(res.status).toBe(201);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('PUT draft→published → rebuild + publishedAt stamped', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();
    const res = await app.request(`/api/pages/${page.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: 'published' }),
    });
    const updated = await res.json() as AnyObj;
    expect(res.status).toBe(200);
    expect(updated.status).toBe('published');
    expect(updated.publishedAt).toBeGreaterThan(0);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('PUT published→draft (unpublish) → rebuild so the site drops it', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();
    await app.request(`/api/pages/${page.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: 'draft' }),
    });
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('PUT published content edit → rebuild', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();
    await app.request(`/api/pages/${page.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ content: 'edited' }),
    });
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('PUT draft content edit → NO rebuild', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();
    await app.request(`/api/pages/${page.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ content: 'edited' }),
    });
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('DELETE published → rebuild', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();
    const res = await app.request(`/api/pages/${page.id}`, { method: 'DELETE', headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('DELETE draft → NO rebuild', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();
    await app.request(`/api/pages/${page.id}`, { method: 'DELETE', headers: authHeaders() });
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('routes/pages — publish endpoint (完备)', () => {
  it('POST /:id/publish → 200, published, publishedAt, rebuild', async () => {
    const { page } = await createPage({ title: 'P', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();
    const res = await app.request(`/api/pages/${page.id}/publish`, { method: 'POST', headers: authHeaders() });
    const published = await res.json() as AnyObj;
    expect(res.status).toBe(200);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeGreaterThan(0);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('POST /:id/publish on a missing page → 404', async () => {
    const res = await app.request('/api/pages/does-not-exist/publish', { method: 'POST', headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as AnyObj;
    expect((body.error as AnyObj).code).toBe('NOT_FOUND');
  });
});

describe('routes/pages — list status filter (完备, public-build safe)', () => {
  it('GET /?status=published returns only published', async () => {
    await createPage({ title: 'Draft One', content: 'x', status: 'draft' });
    await createPage({ title: 'Pub One', content: 'x', status: 'published' });
    const res = await app.request('/api/pages?status=published', { headers: authHeaders() });
    const list = await res.json() as AnyObj[];
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('published');
  });

  it('GET / with no query returns ALL pages (the public build depends on this)', async () => {
    await createPage({ title: 'Draft One', content: 'x', status: 'draft' });
    await createPage({ title: 'Pub One', content: 'x', status: 'published' });
    const res = await app.request('/api/pages');
    const list = await res.json() as AnyObj[];
    expect(list).toHaveLength(2);
  });
});
