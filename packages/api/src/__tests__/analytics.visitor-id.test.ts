import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import { pageViews } from '../db/schema.js';
import {
  recordPageView,
  getVisitorSummary,
  getVisitTrends,
} from '../services/analytics.service.js';
import { normalizeVisitorId } from '../routes/analytics.js';
import { reloadGeoipForTest } from '../lib/geoip.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/GeoIP2-Country-Test.mmdb', import.meta.url));
const originalPath = process.env.GEOIP_DB_PATH;

beforeEach(async () => {
  await db.delete(pageViews);
  process.env.GEOIP_DB_PATH = FIXTURE;
  reloadGeoipForTest();
});

afterAll(() => {
  if (originalPath === undefined) delete process.env.GEOIP_DB_PATH;
  else process.env.GEOIP_DB_PATH = originalPath;
  reloadGeoipForTest();
});

describe('recordPageView visitor_id storage', () => {
  it('persists a supplied visitorId', async () => {
    const row = await recordPageView({ path: '/', ipAddress: '1.2.3.4', visitorId: 'vid-abc' });
    expect(row.visitorId).toBe('vid-abc');
  });

  it('stores null when no visitorId is supplied, but still records the row (PV not lost)', async () => {
    const row = await recordPageView({ path: '/', ipAddress: '1.2.3.4', visitorId: undefined });
    expect(row.visitorId).toBeNull();
    expect(row.id).toBeDefined();
  });
});

describe('normalizeVisitorId (route input validation)', () => {
  it('accepts a normal string id', () => {
    expect(normalizeVisitorId('a4f8c2e0-1234-4abc-9def-0123456789ab')).toBe(
      'a4f8c2e0-1234-4abc-9def-0123456789ab',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeVisitorId('  vid-1  ')).toBe('vid-1');
  });

  it('rejects non-strings → undefined', () => {
    expect(normalizeVisitorId(undefined)).toBeUndefined();
    expect(normalizeVisitorId(null)).toBeUndefined();
    expect(normalizeVisitorId(42)).toBeUndefined();
    expect(normalizeVisitorId({})).toBeUndefined();
  });

  it('rejects empty and over-64-char strings → undefined', () => {
    expect(normalizeVisitorId('')).toBeUndefined();
    expect(normalizeVisitorId('   ')).toBeUndefined();
    expect(normalizeVisitorId('x'.repeat(65))).toBeUndefined();
    expect(normalizeVisitorId('x'.repeat(64))).toBe('x'.repeat(64)); // boundary OK
  });
});

describe('getVisitorSummary / getVisitTrends identity', () => {
  it('counts the same browser visiting many pages as one unique visitor', async () => {
    for (let i = 0; i < 5; i++) {
      await recordPageView({
        path: '/p' + i,
        ipAddress: '9.9.9.9',
        userAgent: 'Mozilla/5.0',
        visitorId: 'V1',
      });
    }
    const s = await getVisitorSummary(30);
    expect(s.uniqueVisitors).toBe(1);
    expect(s.pageViews).toBe(5);
  });

  it('counts distinct browsers as distinct unique visitors', async () => {
    await recordPageView({ path: '/', ipAddress: '9.9.9.9', userAgent: 'Mozilla/5.0', visitorId: 'V1' });
    await recordPageView({ path: '/', ipAddress: '9.9.9.9', userAgent: 'Mozilla/5.0', visitorId: 'V2' });
    const s = await getVisitorSummary(30);
    expect(s.uniqueVisitors).toBe(2);
  });

  it('falls back to ip_hash for rows without a visitorId (old data not dropped)', async () => {
    // Distinct geolocatable IPs, no visitorId → must dedup by ip_hash.
    await recordPageView({ path: '/', ipAddress: '81.2.69.142', userAgent: 'Mozilla/5.0' });
    await recordPageView({ path: '/', ipAddress: '89.160.20.112', userAgent: 'Mozilla/5.0' });
    const s = await getVisitorSummary(30);
    expect(s.uniqueVisitors).toBe(2);
  });

  it('excludes bots from unique visitors but still counts them in page views', async () => {
    await recordPageView({
      path: '/',
      ipAddress: '9.9.9.9',
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      visitorId: 'BOT1',
    });
    await recordPageView({ path: '/', ipAddress: '8.8.8.8', userAgent: 'Mozilla/5.0', visitorId: 'H1' });
    const s = await getVisitorSummary(30);
    expect(s.uniqueVisitors).toBe(1); // bot excluded
    expect(s.pageViews).toBe(2); // PV still counts the bot
  });

  it('applies the same identity/bot semantics in the daily trend', async () => {
    await recordPageView({
      path: '/',
      ipAddress: '9.9.9.9',
      userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0)',
      visitorId: 'BOT2',
    });
    await recordPageView({ path: '/', ipAddress: '8.8.8.8', userAgent: 'Mozilla/5.0', visitorId: 'H1' });
    const trends = await getVisitTrends('daily');
    const latest = trends[trends.length - 1];
    expect(latest.uniqueVisitors).toBe(1); // bot excluded
    expect(latest.pageViews).toBe(2); // bot counted in PV
  });
});
