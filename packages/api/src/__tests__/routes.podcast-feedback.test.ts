import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, episodeFeedback } from '../db/schema.js';
import { resetNewTables } from './helpers.js';

type AnyObj = Record<string, unknown>;

vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: vi.fn().mockResolvedValue(undefined) };
});

const { app } = await import('../app.js');

const KEYS = {
  full:    'wbfull-eeeeeeee', // ["*"]
  reader:  'wbfb-rf-fffffff', // ["podcasts:read"]
  posters: 'wbfb-pt-ggggggg', // ["posts:write"] — no podcasts:read
};

async function seedKey(raw: string, name: string, permissions: string) {
  await db.insert(apiKeys).values({
    id: nanoid(),
    name,
    keyPrefix: raw.slice(0, 8),
    keyHash: await bcrypt.hash(raw, 10),
    permissions,
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing();
}

function bearer(raw: string) {
  return { Authorization: `Bearer ${raw}`, 'content-type': 'application/json' };
}

async function makeEpisode() {
  const showRes = await app.request('/api/podcasts', {
    method: 'POST', headers: bearer(KEYS.full),
    body: JSON.stringify({ title: 'FB Show', ownerEmail: 'fb@test.com' }),
  });
  const show = (await showRes.json()) as AnyObj;
  const epRes = await app.request(`/api/podcasts/${show.slug as string}/episodes`, {
    method: 'POST', headers: bearer(KEYS.full),
    body: JSON.stringify({ title: 'FB Ep', audioUrl: '/uploads/fb.mp3' }),
  });
  return (await epRes.json()) as AnyObj;
}

beforeAll(async () => {
  await seedKey(KEYS.full,    'fb-full',     '["*"]');
  await seedKey(KEYS.reader,  'fb-reader',   '["podcasts:read"]');
  await seedKey(KEYS.posters, 'fb-posters',  '["posts:write"]');
});
afterEach(async () => { await resetNewTables(); });

describe('POST /api/podcasts/episodes/:idOrSlug/feedback', () => {
  it('public POST creates a row (no auth)', async () => {
    const ep = await makeEpisode();
    const res = await app.request(`/api/podcasts/episodes/${ep.slug as string}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'great', reaction: 'up' }),
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as AnyObj;
    expect(row.id).toBeTruthy();
    expect(row.category).toBe('great');
    expect(row.reaction).toBe('up');

    const persisted = await db.select().from(episodeFeedback);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].episodeId).toBe(ep.id);
  });

  it('400s on invalid category', async () => {
    const ep = await makeEpisode();
    const res = await app.request(`/api/podcasts/episodes/${ep.slug as string}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'lol', reaction: 'up' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s on unknown slug', async () => {
    const res = await app.request('/api/podcasts/episodes/no-such-episode-slug/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'great' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/podcasts/episodes/:idOrSlug/feedback (single-episode scoped read)', () => {
  it('returns 200 with the POSTed row for a podcasts:read key', async () => {
    const ep = await makeEpisode();
    await app.request(`/api/podcasts/episodes/${ep.slug as string}/feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'boring', reaction: 'down' }),
    });

    const res = await app.request(
      `/api/podcasts/episodes/${ep.slug as string}/feedback`,
      { headers: bearer(KEYS.reader) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyObj;
    // service returns { data, page, limit }
    const data = (body.data ?? body) as AnyObj[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].category).toBe('boring');
  });

  it('returns 403 for a key lacking podcasts:read', async () => {
    const ep = await makeEpisode();
    const res = await app.request(
      `/api/podcasts/episodes/${ep.slug as string}/feedback`,
      { headers: bearer(KEYS.posters) },
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/podcasts/feedback?since=0 (collection scoped read)', () => {
  it('returns 200 with the POSTed row and is NOT shadowed by GET /:slug', async () => {
    const ep = await makeEpisode();
    await app.request(`/api/podcasts/episodes/${ep.slug as string}/feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'shallow', reaction: 'down' }),
    });

    const res = await app.request('/api/podcasts/feedback?since=0', { headers: bearer(KEYS.reader) });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as AnyObj[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe('shallow');
  });

  it('returns 403 for a key lacking podcasts:read', async () => {
    const res = await app.request('/api/podcasts/feedback?since=0', { headers: bearer(KEYS.posters) });
    expect(res.status).toBe(403);
  });
});
