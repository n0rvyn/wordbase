/**
 * iTunes Lookup Service
 * Fetches public App Store metadata via the iTunes Lookup API.
 */

export interface ItunesAppMeta {
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
