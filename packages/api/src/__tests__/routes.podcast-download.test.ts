import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys, podcastEvents } from '../db/schema.js';
import { resetNewTables } from './helpers.js';

type AnyObj = Record<string, unknown>;

vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: vi.fn().mockResolvedValue(undefined) };
});

const { app } = await import('../app.js');

let rawKey: string;

async function seedApiKey() {
  rawKey = 'testkey-dl-001';
  const now = Math.floor(Date.now() / 1000);
  await db.insert(apiKeys).values({
    id: nanoid(),
    name: 'DL Test Key',
    keyPrefix: rawKey.slice(0, 8),
    keyHash: await bcrypt.hash(rawKey, 10),
    permissions: '["*"]',
    createdAt: now,
  }).onConflictDoNothing();
}

function authHeaders() {
  return { Authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' };
}

async function makePublishedEpisode() {
  const showRes = await app.request('/api/podcasts', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ title: 'DL Show', ownerEmail: 'dl@test.com' }),
  });
  const show = (await showRes.json()) as AnyObj;
  const epRes = await app.request(`/api/podcasts/${show.slug as string}/episodes`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ title: 'DL Episode', audioUrl: '/uploads/dl.mp3', audioSize: 9999 }),
  });
  const ep = (await epRes.json()) as AnyObj;
  await app.request(`/api/podcasts/episodes/${ep.id as string}/publish`, { method: 'POST', headers: authHeaders() });
  return { show, ep };
}

beforeAll(async () => { await seedApiKey(); });
afterEach(async () => { await resetNewTables(); });

describe('GET /api/podcasts/episodes/:idOrSlug/download', () => {
  it('302-redirects to the absolutized audio URL and records a download event', async () => {
    const { ep } = await makePublishedEpisode();

    const res = await app.request(`/api/podcasts/episodes/${ep.slug as string}/download`);
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/uploads/dl.mp3');
    expect(/^https?:\/\//.test(loc)).toBe(true); // absolutized for podcast clients

    const rows = await db.select().from(podcastEvents).where(eq(podcastEvents.eventType, 'download'));
    expect(rows).toHaveLength(1);
    expect(rows[0].episodeId).toBe(ep.id);
  });

  it('404s when the episode does not exist', async () => {
    const res = await app.request('/api/podcasts/episodes/no-such-episode/download');
    expect(res.status).toBe(404);
    const rows = await db.select().from(podcastEvents);
    expect(rows).toHaveLength(0);
  });
});

describe('GET /api/podcasts/:slug/feed.xml', () => {
  it('records a feed_poll event and points the enclosure at the download URL', async () => {
    const { show, ep } = await makePublishedEpisode();

    const res = await app.request(`/api/podcasts/${show.slug as string}/feed.xml`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`/api/podcasts/episodes/${encodeURIComponent(ep.slug as string)}/download`);

    const polls = await db.select().from(podcastEvents).where(eq(podcastEvents.eventType, 'feed_poll'));
    expect(polls).toHaveLength(1);
    expect(polls[0].podcastId).toBe(show.id);
  });
});

// End-to-end: record via the real /download route, then read it back through the
// real /api/observability/podcast/* routes (auth → scope → handler → service → DB) —
// the exact pipeline the admin Observability panel consumes.
describe('Observability podcast endpoints (the admin-panel data source)', () => {
  it('a recorded download surfaces in summary, top-episodes and the episode table', async () => {
    const { ep } = await makePublishedEpisode();
    await app.request(`/api/podcasts/episodes/${ep.slug as string}/download`);

    const summaryRes = await app.request('/api/observability/podcast/summary?days=30', { headers: authHeaders() });
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()) as AnyObj;
    expect(summary.totalDownloads).toBe(1);
    expect(summary.windowDownloads).toBe(1);

    const topRes = await app.request('/api/observability/podcast/top-episodes?limit=10', { headers: authHeaders() });
    const top = (await topRes.json()) as AnyObj[];
    expect(top[0]).toMatchObject({ episodeId: ep.id, downloads: 1 });

    const tableRes = await app.request('/api/observability/podcast/episodes', { headers: authHeaders() });
    const table = (await tableRes.json()) as { id: string; downloads: number; trend: number[] }[];
    const row = table.find((r) => r.id === ep.id)!;
    expect(row.downloads).toBe(1);
    expect(row.trend).toHaveLength(14);

    const clientsRes = await app.request('/api/observability/podcast/clients', { headers: authHeaders() });
    expect(clientsRes.status).toBe(200);
  });

  it('requires auth (401 without a key)', async () => {
    const res = await app.request('/api/observability/podcast/summary');
    expect(res.status).toBe(401);
  });
});
