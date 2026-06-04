import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import { pageViews } from '../db/schema.js';
import { recordPageView, getRegions } from '../services/analytics.service.js';
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

describe('recordPageView geo enrichment', () => {
  it('stores the looked-up country code, never the raw IP', async () => {
    const row = await recordPageView({ path: '/', ipAddress: '81.2.69.142' });
    expect(row.country).toBe('GB');
    expect(row.ipHash).not.toBe('81.2.69.142'); // hashed, not raw
    expect(row.ipHash).toHaveLength(16);
  });

  it('leaves country null for un-geolocatable IPs', async () => {
    const row = await recordPageView({ path: '/', ipAddress: '10.0.0.1' });
    expect(row.country).toBeNull();
  });
});

describe('getRegions', () => {
  it('aggregates visitors by country, excluding null', async () => {
    await recordPageView({ path: '/', ipAddress: '81.2.69.142' });   // GB
    await recordPageView({ path: '/a', ipAddress: '81.2.69.142' });  // GB
    await recordPageView({ path: '/', ipAddress: '89.160.20.112' }); // SE
    await recordPageView({ path: '/', ipAddress: '10.0.0.1' });      // null → excluded

    const regions = await getRegions(30);
    expect(regions).toEqual([
      { country: 'GB', count: 2 },
      { country: 'SE', count: 1 },
    ]);
  });
});
