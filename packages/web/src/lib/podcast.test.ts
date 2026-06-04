import { describe, it, expect } from 'vitest';
import { selectShow, sortEpisodes, episodeMeta } from './podcast';
import type { Podcast, Episode } from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePodcast(partial: Partial<Podcast> & { id: string }): Podcast {
  return {
    slug: partial.id,
    title: partial.id,
    description: null,
    coverImage: null,
    author: null,
    ownerName: null,
    ownerEmail: null,
    language: 'zh-CN',
    category: null,
    explicit: 0,
    link: null,
    copyright: null,
    status: 'published',
    sortOrder: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    meta: null,
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
    publishedAt: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    ...partial,
  };
}

// ─── selectShow ───────────────────────────────────────────────────────────────

describe('selectShow', () => {
  it('returns null for empty array', () => {
    expect(selectShow([])).toBeNull();
  });

  it('selects lowest sortOrder', () => {
    const a = makePodcast({ id: 'a', sortOrder: 2, createdAt: 10 });
    const b = makePodcast({ id: 'b', sortOrder: 1, createdAt: 5 });
    expect(selectShow([a, b])?.id).toBe('b');
  });

  it('nulls are last (loses to a numbered sortOrder)', () => {
    const a = makePodcast({ id: 'a', sortOrder: null, createdAt: 1 });
    const b = makePodcast({ id: 'b', sortOrder: 5, createdAt: 100 });
    expect(selectShow([a, b])?.id).toBe('b');
  });

  it('tiebreaks by createdAt asc when sortOrder equal', () => {
    const a = makePodcast({ id: 'a', sortOrder: 1, createdAt: 200 });
    const b = makePodcast({ id: 'b', sortOrder: 1, createdAt: 100 });
    expect(selectShow([a, b])?.id).toBe('b');
  });

  it('is deterministic regardless of input order', () => {
    const a = makePodcast({ id: 'a', sortOrder: 2, createdAt: 10 });
    const b = makePodcast({ id: 'b', sortOrder: 1, createdAt: 5 });
    expect(selectShow([a, b])?.id).toBe('b');
    expect(selectShow([b, a])?.id).toBe('b');
  });
});

// ─── sortEpisodes ─────────────────────────────────────────────────────────────

describe('sortEpisodes', () => {
  it('sorts by episodeNumber desc', () => {
    const ep1 = makeEpisode({ id: 'ep1', episodeNumber: 1, createdAt: 1000 });
    const ep2 = makeEpisode({ id: 'ep2', episodeNumber: 2, createdAt: 2000 });
    const ep3 = makeEpisode({ id: 'ep3', episodeNumber: 3, createdAt: 3000 });
    const result = sortEpisodes([ep1, ep3, ep2]);
    expect(result.map(e => e.id)).toEqual(['ep3', 'ep2', 'ep1']);
  });

  it('sinks null episodeNumber below numbered', () => {
    const epN = makeEpisode({ id: 'epN', episodeNumber: null, createdAt: 9999 });
    const ep1 = makeEpisode({ id: 'ep1', episodeNumber: 1, createdAt: 1000 });
    const result = sortEpisodes([epN, ep1]);
    expect(result.map(e => e.id)).toEqual(['ep1', 'epN']);
  });

  it('tiebreaks by createdAt desc when episodeNumbers equal', () => {
    const a = makeEpisode({ id: 'a', episodeNumber: 5, createdAt: 1000 });
    const b = makeEpisode({ id: 'b', episodeNumber: 5, createdAt: 2000 });
    const result = sortEpisodes([a, b]);
    expect(result.map(e => e.id)).toEqual(['b', 'a']);
  });

  it('tiebreaks by createdAt desc among null episodeNumbers', () => {
    const a = makeEpisode({ id: 'a', episodeNumber: null, createdAt: 1000 });
    const b = makeEpisode({ id: 'b', episodeNumber: null, createdAt: 2000 });
    const result = sortEpisodes([a, b]);
    expect(result.map(e => e.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the original array', () => {
    const ep1 = makeEpisode({ id: 'ep1', episodeNumber: 1 });
    const ep3 = makeEpisode({ id: 'ep3', episodeNumber: 3 });
    const ep2 = makeEpisode({ id: 'ep2', episodeNumber: 2 });
    const original = [ep1, ep3, ep2];
    const originalOrder = original.map(e => e.id);
    sortEpisodes(original);
    expect(original.map(e => e.id)).toEqual(originalOrder);
  });
});

// ─── episodeMeta ──────────────────────────────────────────────────────────────

describe('episodeMeta', () => {
  // Fixed UTC timestamp: 2026-05-21 12:00:00 UTC → formatMonoDate → '2026 · 05 · 21'
  const fixedTs = Date.UTC(2026, 4, 21, 12, 0, 0) / 1000; // 1779364800

  it('returns exact assembled string with episodeNumber and duration', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: 3, duration: 2880, createdAt: fixedTs });
    expect(episodeMeta(ep)).toBe('EP.3 · 2026 · 05 · 21 · 48 min');
  });

  it('omits EP. prefix when episodeNumber is null', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: null, duration: 2880, createdAt: fixedTs });
    expect(episodeMeta(ep)).toBe('2026 · 05 · 21 · 48 min');
  });

  it('uses publishedAt for the date, not createdAt', () => {
    const published = Date.UTC(2026, 0, 9, 12, 0, 0) / 1000; // 2026-01-09
    const ep = makeEpisode({ id: 'e', episodeNumber: 3, duration: 2880, createdAt: fixedTs, publishedAt: published });
    expect(episodeMeta(ep)).toBe('EP.3 · 2026 · 01 · 09 · 48 min');
  });

  it('falls back to createdAt when publishedAt is null', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: 3, duration: 2880, createdAt: fixedTs, publishedAt: null });
    expect(episodeMeta(ep)).toBe('EP.3 · 2026 · 05 · 21 · 48 min');
  });

  it('omits duration segment when duration is 0', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: 3, duration: 0, createdAt: fixedTs });
    expect(episodeMeta(ep)).toBe('EP.3 · 2026 · 05 · 21');
  });

  it('omits duration segment when duration is null', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: 3, duration: null, createdAt: fixedTs });
    expect(episodeMeta(ep)).toBe('EP.3 · 2026 · 05 · 21');
  });

  it('returns only date when no episodeNumber and no duration', () => {
    const ep = makeEpisode({ id: 'e', episodeNumber: null, duration: null, createdAt: fixedTs });
    expect(episodeMeta(ep)).toBe('2026 · 05 · 21');
  });
});
