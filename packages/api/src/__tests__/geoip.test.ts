import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { lookupCountry, geoipEnabled, reloadGeoipForTest } from '../lib/geoip.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/GeoIP2-Country-Test.mmdb', import.meta.url));
const originalPath = process.env.GEOIP_DB_PATH;

function withDb(path: string | undefined) {
  if (path === undefined) delete process.env.GEOIP_DB_PATH;
  else process.env.GEOIP_DB_PATH = path;
  reloadGeoipForTest();
}

afterAll(() => {
  withDb(originalPath);
});

describe('lookupCountry — no database', () => {
  it('returns null and reports disabled when GEOIP_DB_PATH is unset', () => {
    withDb(undefined);
    expect(geoipEnabled()).toBe(false);
    expect(lookupCountry('81.2.69.142')).toBeNull();
  });

  it('returns null (not throw) when the path is unreadable', () => {
    withDb('/nonexistent/does-not-exist.mmdb');
    expect(geoipEnabled()).toBe(false);
    expect(lookupCountry('81.2.69.142')).toBeNull();
  });
});

describe('lookupCountry — with the GeoIP2 test database', () => {
  it('resolves known test IPs to ISO alpha-2 codes', () => {
    withDb(FIXTURE);
    expect(geoipEnabled()).toBe(true);
    expect(lookupCountry('81.2.69.142')).toBe('GB');
    expect(lookupCountry('89.160.20.112')).toBe('SE');
  });

  it('takes the first hop of an X-Forwarded-For list', () => {
    withDb(FIXTURE);
    expect(lookupCountry('81.2.69.142, 10.0.0.1, 192.168.1.1')).toBe('GB');
  });

  it('returns null for private/unknown/empty IPs', () => {
    withDb(FIXTURE);
    expect(lookupCountry('10.0.0.1')).toBeNull();
    expect(lookupCountry('unknown')).toBeNull();
    expect(lookupCountry('')).toBeNull();
    expect(lookupCountry(null)).toBeNull();
  });
});
