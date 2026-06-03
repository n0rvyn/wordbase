import type { Podcast, Episode } from './api';
import { formatDuration, formatMonoDate } from './home';

/**
 * Select the single show to display per [DP-5.1]:
 * Sort by sortOrder asc (nulls last), tiebreak createdAt asc. Return first.
 * Returns null for empty array.
 */
export function selectShow(podcasts: Podcast[]): Podcast | null {
  if (podcasts.length === 0) return null;
  return [...podcasts].sort((a, b) => {
    const sa = a.sortOrder ?? Infinity;
    const sb = b.sortOrder ?? Infinity;
    if (sa !== sb) return sa - sb;
    return a.createdAt - b.createdAt;
  })[0];
}

/**
 * Sort episodes per [DP-5.7]:
 * episodeNumber desc (nulls last), tiebreak createdAt desc.
 * Returns a new array; does not mutate input.
 */
export function sortEpisodes(eps: Episode[]): Episode[] {
  return [...eps].sort((a, b) => {
    const na = a.episodeNumber ?? -Infinity;
    const nb = b.episodeNumber ?? -Infinity;
    if (na !== nb) return nb - na; // desc
    return b.createdAt - a.createdAt; // tiebreak: createdAt desc
  });
}

/**
 * Build the display meta string for an episode, e.g. "EP.3 · 2026 · 05 · 21 · 48 min".
 * Parts: EP.{n} (if episodeNumber != null), date (always), duration (if non-empty).
 * Joined with ' · '.
 *
 * Date is the real publish date (publishedAt), falling back to createdAt only when
 * an episode has no publish date — otherwise every episode shows its ingest day,
 * not when it aired.
 */
export function episodeMeta(ep: Episode): string {
  const parts: string[] = [];
  if (ep.episodeNumber != null) {
    parts.push(`EP.${ep.episodeNumber}`);
  }
  parts.push(formatMonoDate(ep.publishedAt ?? ep.createdAt));
  const dur = formatDuration(ep.duration);
  if (dur) parts.push(dur);
  return parts.join(' · ');
}
