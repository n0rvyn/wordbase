import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { shareEvents } from '../db/schema.js';
import { recordShare, getShareStats } from '../services/analytics.service.js';

beforeEach(async () => {
  await db.delete(shareEvents);
});

describe('recordShare', () => {
  it('records valid channels and rejects unknown targets', async () => {
    expect(await recordShare({ path: '/posts/a', target: 'x' })).toBeTruthy();
    expect(await recordShare({ path: '/posts/a', target: 'copy' })).toBeTruthy();
    expect(await recordShare({ path: '/posts/a', target: 'bogus' })).toBeNull();
    expect(await recordShare({ path: '/posts/a', target: 'episode' })).toBeNull(); // context belongs in path, not target

    const rows = await db.select().from(shareEvents);
    expect(rows).toHaveLength(2);
  });

  it('keeps distinct paths as distinct rows (per-episode anchors do not collapse)', async () => {
    await recordShare({ path: '/podcast#ep-one', target: 'native' });
    await recordShare({ path: '/podcast#ep-two', target: 'native' });

    const { byPage } = await getShareStats(30);
    const paths = byPage.map((p) => p.path).sort();
    expect(paths).toEqual(['/podcast#ep-one', '/podcast#ep-two']);
  });
});

describe('getShareStats', () => {
  it('aggregates by channel and by page', async () => {
    await recordShare({ path: '/posts/a', target: 'x' });
    await recordShare({ path: '/posts/a', target: 'x' });
    await recordShare({ path: '/posts/a', target: 'copy' });
    await recordShare({ path: '/posts/b', target: 'x' });

    const { byTarget, byPage } = await getShareStats(30);
    expect(Object.fromEntries(byTarget.map((t) => [t.target, t.count]))).toEqual({ x: 3, copy: 1 });
    expect(Object.fromEntries(byPage.map((p) => [p.path, p.count]))).toEqual({ '/posts/a': 3, '/posts/b': 1 });
  });

  it('excludes events outside the window', async () => {
    const old = Math.floor(Date.now() / 1000) - 40 * 86400;
    await db.insert(shareEvents).values({ path: '/posts/old', target: 'x', ipHash: null, createdAt: old });
    await recordShare({ path: '/posts/new', target: 'x' });

    const { byPage } = await getShareStats(30);
    expect(byPage.map((p) => p.path)).toEqual(['/posts/new']);
  });
});
