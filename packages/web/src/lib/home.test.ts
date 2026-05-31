import { describe, it, expect } from 'vitest';
import {
  formatMonoDate,
  decodeEntities,
  selectFeaturedApp,
  restApps,
  selectFeaturedEpisode,
  formatDuration,
} from './home';
import type { App, Episode } from './api';

// ─── formatMonoDate ───────────────────────────────────────────────────────────

describe('formatMonoDate', () => {
  it('formats a known 12:00 UTC timestamp correctly', () => {
    // 2024-01-15 12:00:00 UTC
    const ts = Date.UTC(2024, 0, 15, 12, 0, 0) / 1000;
    expect(formatMonoDate(ts)).toBe('2024 · 01 · 15');
  });

  it('zero-pads single-digit month and day', () => {
    // 2023-03-07 12:00:00 UTC
    const ts = Date.UTC(2023, 2, 7, 12, 0, 0) / 1000;
    expect(formatMonoDate(ts)).toBe('2023 · 03 · 07');
  });
});

// ─── decodeEntities ───────────────────────────────────────────────────────────

describe('decodeEntities', () => {
  it('decodes &amp; in a real-world category name', () => {
    expect(decodeEntities('AIX &amp; Power')).toBe('AIX & Power');
  });

  it('decodes &lt; and &gt;', () => {
    expect(decodeEntities('&lt;a&gt;')).toBe('<a>');
  });

  it('returns plain strings unchanged', () => {
    expect(decodeEntities('Hello World')).toBe('Hello World');
  });

  it('does not double-decode', () => {
    // &amp;amp; → &amp; (one pass), not &
    expect(decodeEntities('&amp;amp;')).toBe('&amp;');
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp(partial: Partial<App> & { id: string }): App {
  return {
    slug: partial.id,
    name: partial.id,
    tagline: null,
    icon: null,
    description: null,
    appStoreUrl: null,
    appStoreId: null,
    bundleId: null,
    platform: 'iOS',
    price: null,
    rating: null,
    ratingCount: null,
    accentColor: null,
    features: null,
    screenshots: null,
    links: null,
    status: 'published',
    sortOrder: null,
    publishedAt: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    meta: null,
    category: null,
    version: null,
    releaseDate: null,
    currentVersionReleaseDate: null,
    minimumOsVersion: null,
    subtitle: null,
    whatsNew: null,
    featured: 0,
    lastSyncedAt: null,
    ...partial,
  };
}

function makeEpisode(partial: Partial<Episode> & { id: string }): Episode {
  return {
    podcastId: 'p1',
    slug: partial.id,
    guid: partial.id,
    title: partial.id,
    summary: null,
    showNotes: null,
    transcript: null,
    audioUrl: 'https://example.com/ep.mp3',
    audioType: 'audio/mpeg',
    audioSize: 0,
    duration: null,
    coverImage: null,
    episodeNumber: null,
    seasonNumber: null,
    episodeType: 'full',
    explicit: null,
    status: 'published',
    createdAt: 1700000000,
    updatedAt: 1700000000,
    ...partial,
  };
}

// ─── selectFeaturedApp ────────────────────────────────────────────────────────

describe('selectFeaturedApp', () => {
  it('returns null for empty array', () => {
    expect(selectFeaturedApp([])).toBeNull();
  });

  it('featured flag wins over lower sortOrder', () => {
    const a = makeApp({ id: 'a', sortOrder: 1, featured: 0 });
    const b = makeApp({ id: 'b', sortOrder: 5, featured: 1 });
    expect(selectFeaturedApp([a, b])?.id).toBe('b');
  });

  it('with no flag, selects lowest sortOrder', () => {
    const a = makeApp({ id: 'a', sortOrder: 3, featured: 0 });
    const b = makeApp({ id: 'b', sortOrder: 1, featured: 0 });
    expect(selectFeaturedApp([a, b])?.id).toBe('b');
  });

  it('nulls-last for sortOrder', () => {
    const a = makeApp({ id: 'a', sortOrder: null, featured: 0 });
    const b = makeApp({ id: 'b', sortOrder: 2, featured: 0 });
    expect(selectFeaturedApp([a, b])?.id).toBe('b');
  });

  it('tiebreaks by earliest publishedAt', () => {
    const a = makeApp({ id: 'a', sortOrder: 1, featured: 0, publishedAt: 1700000200 });
    const b = makeApp({ id: 'b', sortOrder: 1, featured: 0, publishedAt: 1700000100 });
    expect(selectFeaturedApp([a, b])?.id).toBe('b');
  });
});

// ─── restApps ─────────────────────────────────────────────────────────────────

describe('restApps', () => {
  it('excludes featured by id, preserves order', () => {
    const a = makeApp({ id: 'a' });
    const b = makeApp({ id: 'b' });
    const c = makeApp({ id: 'c' });
    const result = restApps([a, b, c], b);
    expect(result.map(x => x.id)).toEqual(['a', 'c']);
  });

  it('returns all apps when featured is null', () => {
    const a = makeApp({ id: 'a' });
    const b = makeApp({ id: 'b' });
    expect(restApps([a, b], null)).toEqual([a, b]);
  });
});

// ─── selectFeaturedEpisode ────────────────────────────────────────────────────

describe('selectFeaturedEpisode', () => {
  it('returns null for empty array', () => {
    expect(selectFeaturedEpisode([])).toBeNull();
  });

  it('selects highest episodeNumber', () => {
    const a = makeEpisode({ id: 'a', episodeNumber: 3 });
    const b = makeEpisode({ id: 'b', episodeNumber: 10 });
    const c = makeEpisode({ id: 'c', episodeNumber: 7 });
    expect(selectFeaturedEpisode([a, b, c])?.id).toBe('b');
  });

  it('falls back to latest createdAt when all episodeNumbers are null', () => {
    const a = makeEpisode({ id: 'a', episodeNumber: null, createdAt: 1700000100 });
    const b = makeEpisode({ id: 'b', episodeNumber: null, createdAt: 1700000300 });
    expect(selectFeaturedEpisode([a, b])?.id).toBe('b');
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns empty string for null', () => {
    expect(formatDuration(null)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('returns "<1 min" for 30 seconds', () => {
    expect(formatDuration(30)).toBe('<1 min');
  });

  it('returns "41 min" for 2460 seconds', () => {
    expect(formatDuration(2460)).toBe('41 min');
  });

  it('returns "59 min" for 3540 seconds', () => {
    expect(formatDuration(3540)).toBe('59 min');
  });
});
