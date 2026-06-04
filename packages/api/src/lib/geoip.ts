import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import maxmind, { Reader, type CountryResponse } from 'maxmind';
import { open as geoliteOpen, GeoIpDbName } from 'geolite2-redist';
import { REPO_ROOT } from '../paths.js';

// Offline IP→country lookup.
//
//   • Default: geolite2-redist auto-downloads GeoLite2-Country from a permitted
//     mirror (NO MaxMind license key) into data/geoip and keeps it auto-updated.
//   • Override: set GEOIP_DB_PATH to a local .mmdb to bring your own DB (also how
//     the test suite loads its fixture). The override is synchronous and wins.
//
// Either way, lookups are synchronous and degrade to null if no DB is ready.

type CountryReader = { get(ip: string): CountryResponse | null };

// Must sit inside the API data dir (alongside blog.db): on prod that's the only
// path the systemd sandbox (ProtectSystem=strict) makes writable. geolite2-redist
// also mkdtemp's a SIBLING temp dir, so the parent (packages/api/data) must be RW.
const DOWNLOAD_DIR = resolve(REPO_ROOT, 'packages/api/data/geoip');

let reader: CountryReader | null = null;

// Synchronous BYO/test loader. Returns true if GEOIP_DB_PATH was set (whether or
// not it loaded), so the auto-download path is skipped when an override exists.
function loadOverride(): boolean {
  const path = process.env.GEOIP_DB_PATH;
  if (!path) return false;
  try {
    reader = new Reader<CountryResponse>(readFileSync(path));
  } catch (err) {
    console.warn(`[geoip] override ${path} unreadable: ${(err as Error).message} — country lookup disabled`);
    reader = null;
  }
  return true;
}

// Call once at server boot (fire-and-forget — see index.ts). GEOIP_DB_PATH wins
// synchronously; otherwise geolite2-redist downloads + auto-updates the DB. Any
// failure leaves reader null and lookups degrade to null (never throws).
export async function initGeoip(): Promise<void> {
  if (loadOverride()) return;
  try {
    // geolite2-redist mkdtemp's a sibling temp dir, so the download dir's parent
    // must exist first (REPO_ROOT/data isn't guaranteed to).
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
    reader = await geoliteOpen<Reader<CountryResponse>>(
      GeoIpDbName.Country,
      (path: string) => maxmind.open<CountryResponse>(path),
      DOWNLOAD_DIR,
    );
  } catch (err) {
    console.warn(`[geoip] geolite2-redist init failed: ${(err as Error).message} — country lookup disabled`);
    reader = null;
  }
}

/** Force a synchronous (re)load from GEOIP_DB_PATH — test-only hook. */
export function reloadGeoipForTest(): void {
  reader = null;
  loadOverride();
}

/** Whether a usable GeoIP database is loaded. */
export function geoipEnabled(): boolean {
  return reader !== null;
}

/**
 * ISO-3166-1 alpha-2 country code for an IP, or null. Tolerates an
 * X-Forwarded-For list ("client, proxy1, …") by taking the first hop.
 */
export function lookupCountry(ip: string | undefined | null): string | null {
  if (!reader || !ip) return null;
  const clean = ip.split(',')[0].trim();
  if (!clean || clean === 'unknown') return null;
  try {
    return reader.get(clean)?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}
