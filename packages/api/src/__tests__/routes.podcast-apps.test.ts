import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { resetNewTables } from './helpers.js';

type AnyObj = Record<string, unknown>;

// Mock build.service before importing app
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

// Import app AFTER mock is set up
const { app } = await import('../app.js');
const { triggerBuild } = await import('../services/build.service.js');

const triggerBuildSpy = triggerBuild as ReturnType<typeof vi.fn>;

let rawKey: string;

async function seedApiKey() {
  rawKey = 'testkey-abc123';
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
  return {
    Authorization: `Bearer ${rawKey}`,
    'content-type': 'application/json',
  };
}

beforeAll(async () => {
  await seedApiKey();
});

afterEach(async () => {
  await resetNewTables();
  triggerBuildSpy.mockClear();
});

describe('POST /api/podcasts', () => {
  it('creates a podcast show and returns 201 with slug', async () => {
    const res = await app.request('/api/podcasts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: '每日综合播客', ownerEmail: 'norvyn@norvyn.com' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as AnyObj;
    expect(body.slug).toBeTruthy();
    expect(body.title).toBe('每日综合播客');
  });
});

describe('Episode upsert idempotency over HTTP', () => {
  it('upserts episode twice — total count stays 1', async () => {
    const showRes = await app.request('/api/podcasts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'My Show', ownerEmail: 'test@test.com' }),
    });
    const show = await showRes.json() as AnyObj;
    const slug = show.slug as string;

    const epPayload = {
      title: 'Episode 1',
      audioUrl: '/uploads/ep1.mp3',
      audioSize: 1234,
      duration: 600,
      externalSource: 'adam',
      externalId: 'ep-upsert-1',
    };

    // First upsert
    const r1 = await app.request(`/api/podcasts/${slug}/episodes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(epPayload),
    });
    expect(r1.status).toBe(201);

    // Second upsert (same externalId)
    const r2 = await app.request(`/api/podcasts/${slug}/episodes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...epPayload, title: 'Episode 1 v2' }),
    });
    expect(r2.status).toBe(200);

    // List episodes — should be exactly 1
    const listRes = await app.request(`/api/podcasts/${slug}/episodes`);
    const list = await listRes.json() as AnyObj;
    expect(list.total).toBe(1);
  });
});

describe('GET /api/podcasts/:slug/feed.xml', () => {
  it('returns application/rss+xml content-type', async () => {
    const showRes = await app.request('/api/podcasts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Feed Test Show', ownerEmail: 'rss@test.com' }),
    });
    const show = await showRes.json() as AnyObj;

    const res = await app.request(`/api/podcasts/${show.slug as string}/feed.xml`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct.toLowerCase()).toContain('application/rss+xml');
  });
});

describe('Apps CRUD', () => {
  it('creates an app with features array and GET returns it', async () => {
    const features = [{ icon: 'star', title: 'Feature A', blurb: 'Nice feature' }];
    const createRes = await app.request('/api/apps', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'My App', features }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as AnyObj;
    expect(created.slug).toBeTruthy();

    const getRes = await app.request(`/api/apps/${created.slug as string}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json() as AnyObj;
    expect(JSON.parse(fetched.features as string)).toEqual(features);
  });
});

describe('Publish triggers triggerBuild (DP-002)', () => {
  it('POST /api/podcasts/:id/publish calls triggerBuild', async () => {
    const showRes = await app.request('/api/podcasts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Publish Test', ownerEmail: 'pub@test.com' }),
    });
    const show = await showRes.json() as AnyObj;

    triggerBuildSpy.mockClear();
    const publishRes = await app.request(`/api/podcasts/${show.id as string}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(publishRes.status).toBe(200);
    expect(triggerBuildSpy).toHaveBeenCalled();
  });

  it('POST /api/podcasts/episodes/:id/publish calls triggerBuild', async () => {
    const showRes = await app.request('/api/podcasts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Ep Publish Test', ownerEmail: 'ep@test.com' }),
    });
    const show = await showRes.json() as AnyObj;

    const epRes = await app.request(`/api/podcasts/${show.slug as string}/episodes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Ep1', audioUrl: '/uploads/e.mp3' }),
    });
    const ep = await epRes.json() as AnyObj;

    triggerBuildSpy.mockClear();
    const publishRes = await app.request(`/api/podcasts/episodes/${ep.id as string}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(publishRes.status).toBe(200);
    expect(triggerBuildSpy).toHaveBeenCalled();
  });

  it('POST /api/apps/:id/publish calls triggerBuild', async () => {
    const createRes = await app.request('/api/apps', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'App Publish' }),
    });
    const appItem = await createRes.json() as AnyObj;

    triggerBuildSpy.mockClear();
    const publishRes = await app.request(`/api/apps/${appItem.id as string}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(publishRes.status).toBe(200);
    expect(triggerBuildSpy).toHaveBeenCalled();
  });

  it('POST /api/posts/:id/publish calls triggerBuild (DP-002 posts consistency)', async () => {
    const createRes = await app.request('/api/posts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Post for publish test', content: 'Hello world' }),
    });
    const post = await createRes.json() as AnyObj;

    triggerBuildSpy.mockClear();
    const publishRes = await app.request(`/api/posts/${post.id as string}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(publishRes.status).toBe(200);
    expect(triggerBuildSpy).toHaveBeenCalled();
  });
});

describe('Regression: existing routes still work', () => {
  it('GET /api/posts still returns 200', async () => {
    const res = await app.request('/api/posts');
    expect(res.status).toBe(200);
  });
});
