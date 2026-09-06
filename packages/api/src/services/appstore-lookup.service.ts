/**
 * iTunes Lookup Service
 * Fetches public App Store metadata via the iTunes Lookup API.
 */

export interface ItunesAppMeta {
  /** Store display name (`trackName`) for the queried country. */
  name: string | null;
  /** Canonical store page (`trackViewUrl`). */
  appStoreUrl: string | null;
  category: string | null;
  version: string | null;
  releaseDate: number | null;
  currentVersionReleaseDate: number | null;
  minimumOsVersion: string | null;
  rating: number | null;
  ratingCount: number | null;
  price: string | null;
  icon: string | null;
  screenshots: string[];
  description: string | null;
  platform: string;
}

function toTs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function toNum(val: unknown): number | null {
  const n = Number(val);
  return isFinite(n) ? n : null;
}

/**
 * Storefronts tried, in order, when deciding whether an app is on sale at all.
 *
 * `cn` first because the site is Chinese-first: the CN listing carries the
 * Chinese name, Chinese description and ¥ pricing. `us` second because an app
 * without a mainland ICP filing is absent from the CN storefront while being
 * perfectly live elsewhere — checking only `cn` would report it as unreleased.
 *
 * (Measured 2026-09-06: all six live apps are on both, and their US listings
 * carry English names and USD prices — `Cashie - AI Expense Tracker` / $9.99
 * against `Cashie 记账 - AI拍照语音自动记账本` / ¥68.00 — which is why `us` is
 * a fallback for availability, not the primary metadata source.)
 */
export const LOOKUP_STOREFRONTS = ['cn', 'us'] as const;

/**
 * Look an app up across storefronts in order, returning the first hit together
 * with the storefront that answered. `null` means no storefront lists it —
 * i.e. the app is not released anywhere, so the site has nothing to link to.
 */
export async function lookupAppAnyStorefront(
  appStoreId: string,
  storefronts: readonly string[] = LOOKUP_STOREFRONTS,
): Promise<{ meta: ItunesAppMeta; storefront: string } | null> {
  for (const storefront of storefronts) {
    const meta = await lookupApp(appStoreId, storefront);
    if (meta) return { meta, storefront };
  }
  return null;
}

export async function lookupApp(
  appStoreId: string,
  country = 'cn'
): Promise<ItunesAppMeta | null> {
  if (!/^\d+$/.test(appStoreId)) {
    throw new Error('invalid appStoreId');
  }

  const url = `https://itunes.apple.com/lookup?id=${appStoreId}&country=${encodeURIComponent(country)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iTunes Lookup failed: ${res.status}`);
  }

  const data = await res.json() as { resultCount: number; results: Record<string, unknown>[] };

  if (data.resultCount < 1) {
    return null;
  }

  const r = data.results[0];

  const screenshots = Array.isArray(r.screenshotUrls)
    ? (r.screenshotUrls as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const platform = r.kind === 'mac-software' ? 'macOS' : 'iOS';

  return {
    name: typeof r.trackName === 'string' ? r.trackName : null,
    appStoreUrl: typeof r.trackViewUrl === 'string' ? r.trackViewUrl : null,
    category: typeof r.primaryGenreName === 'string' ? r.primaryGenreName : null,
    version: typeof r.version === 'string' ? r.version : null,
    releaseDate: toTs(r.releaseDate),
    currentVersionReleaseDate: toTs(r.currentVersionReleaseDate),
    minimumOsVersion: typeof r.minimumOsVersion === 'string' ? r.minimumOsVersion : null,
    rating: toNum(r.averageUserRating),
    ratingCount: toNum(r.userRatingCount),
    price: typeof r.formattedPrice === 'string' ? r.formattedPrice : null,
    icon: typeof r.artworkUrl512 === 'string' ? r.artworkUrl512 : null,
    screenshots,
    description: typeof r.description === 'string' ? r.description : null,
    platform,
  };
}
