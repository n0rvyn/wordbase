import type { App, Episode } from './api';

/**
 * Format a Unix timestamp (seconds) as "YYYY · MM · DD" using UTC date parts.
 * UTC-based so the rendered date is build-server-timezone-independent.
 */
export function formatMonoDate(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y} · ${m} · ${day}`;
}

/**
 * Decode common HTML entities. Decodes &amp; last to avoid double-decode.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Select the featured app per [D-B]:
 * 1. featured === 1 first
 * 2. else lowest sortOrder (nulls last)
 * 3. tiebreak: earliest publishedAt ?? createdAt
 * Returns null for empty array.
 */
export function selectFeaturedApp(apps: App[]): App | null {
  if (apps.length === 0) return null;

  // Check for explicitly featured
  const flagged = apps.filter(a => a.featured === 1);
  if (flagged.length > 0) {
    return flagged.sort((a, b) => {
      const ta = a.publishedAt ?? a.createdAt;
      const tb = b.publishedAt ?? b.createdAt;
      return ta - tb;
    })[0];
  }

  // Fall back to lowest sortOrder, nulls last, tiebreak by earliest publishedAt ?? createdAt
  return [...apps].sort((a, b) => {
    const sa = a.sortOrder ?? Infinity;
    const sb = b.sortOrder ?? Infinity;
    if (sa !== sb) return sa - sb;
    const ta = a.publishedAt ?? a.createdAt;
    const tb = b.publishedAt ?? b.createdAt;
    return ta - tb;
  })[0];
}

/**
 * Return apps minus the featured app, preserving original order.
 * If featured is null, returns all apps unchanged.
 */
export function restApps(apps: App[], featured: App | null): App[] {
  if (!featured) return apps;
  return apps.filter(a => a.id !== featured.id);
}

/**
 * Select the featured episode per [D-C]:
 * 1. Highest episodeNumber
 * 2. If all null, latest createdAt
 * Returns null for empty array.
 */
export function selectFeaturedEpisode(eps: Episode[]): Episode | null {
  if (eps.length === 0) return null;

  const withNumber = eps.filter(e => e.episodeNumber !== null);
  if (withNumber.length > 0) {
    return withNumber.sort((a, b) => (b.episodeNumber as number) - (a.episodeNumber as number))[0];
  }

  // All null episodeNumbers — latest createdAt
  return [...eps].sort((a, b) => b.createdAt - a.createdAt)[0];
}

/**
 * Format duration in seconds to human-readable string.
 * null / <= 0 → ''
 * < 60 → '<1 min'
 * else → '{Math.round(sec/60)} min'
 */
export function formatDuration(sec: number | null): string {
  if (sec === null || sec <= 0) return '';
  if (sec < 60) return '<1 min';
  return `${Math.round(sec / 60)} min`;
}
