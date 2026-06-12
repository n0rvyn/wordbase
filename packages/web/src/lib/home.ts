import {
  getPosts,
  getApps,
  getPodcasts,
  getEpisodes,
  getCategories,
  type App,
  type Episode,
  type Post,
  type Podcast,
} from './api';
import { localizePost, localizeApp } from './localize';
import type { Locale } from './locale';

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

/**
 * Shape consumed by the shared HomeBody component. The zh and en home shells
 * both call loadHomeData and spread the result into <HomeBody> — the body is
 * pure presentation. postCat/podcast/episodes are zh-only (null/[] on en),
 * which is how the en home omits the category meta + podcast section without
 * the body branching on locale for content.
 */
export interface HomeData {
  posts: Post[];
  /** post.id → first category name (source language until categories are translated). */
  postCat: Map<string, string>;
  apps: App[];
  podcast: Podcast | null;
  episodes: Episode[];
}

/**
 * Load + locale-shape the home page data for one locale. Single source for
 * both the zh shell (pages/index.astro) and the en shell (pages/en/index.astro)
 * so the two never drift. en localizes post/app fields through the i18n cache;
 * the category map + podcast section render in both locales (text stays source
 * language until translated — deferred to the final i18n dev-guide).
 */
export async function loadHomeData(locale: Locale): Promise<HomeData> {
  const en = locale === 'en';

  // ── Writing: 6 newest published posts ──────────────────────────────────────
  const { data: postsRaw } = await getPosts({ status: 'published', limit: 6 });
  const postsSorted = [...postsRaw]
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, 6);
  const posts = en
    ? await Promise.all(postsSorted.map((p) => localizePost(p, 'en')))
    : postsSorted;

  // ── Category map [D-E] — both locales ───────────────────────────────────────
  // The en home shows the same writing-row category meta as zh; category names
  // stay in the source language until categories are translated (that work is
  // deferred to the final i18n dev-guide). Structure displays now.
  const postCat = new Map<string, string>();
  {
    const cats = await getCategories();
    for (const cat of cats) {
      const { data } = await getPosts({ status: 'published', category: cat.slug, limit: 500 });
      for (const p of data) {
        if (!postCat.has(p.id)) postCat.set(p.id, decodeEntities(cat.name));
      }
    }
  }

  // ── Apps ────────────────────────────────────────────────────────────────────
  const { data: appsRaw } = await getApps({ status: 'published' });
  const apps = en ? await Promise.all(appsRaw.map((a) => localizeApp(a, 'en'))) : appsRaw;

  // ── Podcast — both locales render the section ───────────────────────────────
  // The en home displays the podcast section with the same structure as zh.
  // 拾余光 episode/show text stays Chinese until the show is translated (deferred
  // to the final i18n dev-guide); the section itself shows now.
  const { data: podcasts } = await getPodcasts({ status: 'published' });
  const podcast = podcasts[0] ?? null;
  let episodes: Episode[] = [];
  if (podcast) {
    episodes = (await getEpisodes(podcast.slug, { status: 'published', limit: 10 })).data;
  }

  return { posts, postCat, apps, podcast, episodes };
}
