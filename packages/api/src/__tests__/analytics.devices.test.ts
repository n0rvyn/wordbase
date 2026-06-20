import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { pageViews } from '../db/schema.js';
import { getDeviceBreakdown } from '../services/analytics.service.js';

const now = Math.floor(Date.now() / 1000);
const DAY = 86400;

beforeEach(async () => { await db.delete(pageViews); });

describe('getDeviceBreakdown — time window', () => {
  it('excludes rows older than the window', async () => {
    await db.insert(pageViews).values([
      { path: '/', userAgent: 'Mozilla/5.0 (Macintosh)', referrer: null, ipHash: null, createdAt: now },        // desktop, in
      { path: '/', userAgent: 'Mozilla/5.0 (iPhone)', referrer: null, ipHash: null, createdAt: now },           // mobile, in
      { path: '/', userAgent: 'Mozilla/5.0 (Macintosh)', referrer: null, ipHash: null, createdAt: now - 40 * DAY }, // desktop, OUT
    ]);
    const rows = await getDeviceBreakdown(30);
    const byType = Object.fromEntries(rows.map(r => [r.type, r.count]));
    expect(byType.desktop).toBe(1); // only the in-window desktop row
    expect(byType.mobile).toBe(1);
  });
});