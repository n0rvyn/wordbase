import { describe, it, expect } from 'vitest';
import type { Post } from './api';
import {
  selectTopCategories,
  groupByYear,
  selectFullYears,
  densityForYear,
} from './writing';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePost(partial: Partial<Post> & { id: string }): Post {
  return {
    slug: partial.id,
    title: partial.id,
    content: '',
    excerpt: null,
    coverImage: null,
    status: 'published',
    shareToken: null,
    publishedAt: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    meta: null,
    ...partial,
  };
}

// ─── selectTopCategories ──────────────────────────────────────────────────────

describe('selectTopCategories', () => {
  const cats = [
    { slug: 'tech', name: 'Technology', count: 30 },
    { slug: 'uncategorized', name: 'Uncategorized', count: 0 },
    { slug: 'macos_apple_pc', name: 'MacOS &amp; Apple &amp; PC', count: 15 },
    { slug: 'design', name: 'Design', count: 20 },
    { slug: 'life', name: 'Life', count: 10 },
    { slug: 'travel', name: 'Travel', count: 5 },
    { slug: 'food', name: 'Food', count: 8 },
    { slug: 'music', name: 'Music', count: 12 },
  ];

  it('excludes zero-count categories', () => {
    const result = selectTopCategories(cats, 10);
    expect(result.find(c => c.slug === 'uncategorized')).toBeUndefined();
  });

  it('decodes &amp; in category names', () => {
    const result = selectTopCategories(cats, 10);
    const mac = result.find(c => c.slug === 'macos_apple_pc');
    expect(mac?.name).toBe('MacOS & Apple & PC');
  });

  it('sorts by count desc', () => {
    const result = selectTopCategories(cats, 10);
    const counts = result.map(c => {
      const orig = cats.find(x => x.slug === c.slug)!;
      return orig.count;
    });
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
    }
  });

  it('returns at most `limit` items', () => {
    const result = selectTopCategories(cats, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns the top 3 by count', () => {
    const result = selectTopCategories(cats, 3);
    expect(result.map(c => c.slug)).toEqual(['tech', 'design', 'macos_apple_pc']);
  });

  it('tiebreaks by name asc', () => {
    const tiedCats = [
      { slug: 'b', name: 'Beta', count: 10 },
      { slug: 'a', name: 'Alpha', count: 10 },
    ];
    const result = selectTopCategories(tiedCats, 5);
    expect(result[0].slug).toBe('a');
    expect(result[1].slug).toBe('b');
  });
});

// ─── groupByYear ──────────────────────────────────────────────────────────────

describe('groupByYear', () => {
  // Timestamps for known UTC dates:
  // 2025-03-01 = 1740787200
  // 2024-07-15 = 1721001600
  // 2024-01-20 = 1705708800
  // 2023-11-05 = 1699142400
  const posts = [
    makePost({ id: 'p1', publishedAt: 1740787200 }), // 2025
    makePost({ id: 'p2', publishedAt: 1721001600 }), // 2024 Jul
    makePost({ id: 'p3', publishedAt: 1705708800 }), // 2024 Jan
    makePost({ id: 'p4', publishedAt: 1699142400 }), // 2023
  ];

  it('groups posts by UTC year', () => {
    const groups = groupByYear(posts);
    const years = groups.map(g => g.year);
    expect(years).toContain(2025);
    expect(years).toContain(2024);
    expect(years).toContain(2023);
  });

  it('sorts groups year desc (newest first)', () => {
    const groups = groupByYear(posts);
    expect(groups[0].year).toBe(2025);
    expect(groups[1].year).toBe(2024);
    expect(groups[2].year).toBe(2023);
  });

  it('puts multiple posts in the same year group', () => {
    const groups = groupByYear(posts);
    const y2024 = groups.find(g => g.year === 2024)!;
    expect(y2024.posts.length).toBe(2);
  });

  it('sorts posts within a year by publishedAt desc', () => {
    const groups = groupByYear(posts);
    const y2024 = groups.find(g => g.year === 2024)!;
    expect(y2024.posts[0].id).toBe('p2'); // Jul is newer
    expect(y2024.posts[1].id).toBe('p3'); // Jan is older
  });

  it('puts posts with null publishedAt in year 0 at the end', () => {
    const postsWithNull = [
      ...posts,
      makePost({ id: 'pnull', publishedAt: null }),
    ];
    const groups = groupByYear(postsWithNull);
    const last = groups[groups.length - 1];
    expect(last.year).toBe(0);
    expect(last.posts[0].id).toBe('pnull');
  });
});

// ─── selectFullYears ──────────────────────────────────────────────────────────

describe('selectFullYears', () => {
  // 2025-03-01, 2024-07-15, 2023-11-05
  const posts = [
    makePost({ id: 'p1', publishedAt: 1740787200 }), // 2025
    makePost({ id: 'p2', publishedAt: 1721001600 }), // 2024
    makePost({ id: 'p3', publishedAt: 1699142400 }), // 2023
  ];

  it('returns the k newest distinct UTC years present', () => {
    expect(selectFullYears(posts, 2)).toEqual([2025, 2024]);
  });

  it('returns all years when k >= distinct years', () => {
    expect(selectFullYears(posts, 5)).toEqual([2025, 2024, 2023]);
  });

  it('returns empty array for empty posts', () => {
    expect(selectFullYears([], 2)).toEqual([]);
  });

  it('returns single year when k=1', () => {
    expect(selectFullYears(posts, 1)).toEqual([2025]);
  });
});

// ─── densityForYear ───────────────────────────────────────────────────────────

describe('densityForYear', () => {
  const fullYears = [2025, 2024];

  it('returns "full" when year is in fullYears', () => {
    expect(densityForYear(2025, fullYears)).toBe('full');
    expect(densityForYear(2024, fullYears)).toBe('full');
  });

  it('returns "compact" when year is not in fullYears', () => {
    expect(densityForYear(2023, fullYears)).toBe('compact');
    expect(densityForYear(2022, fullYears)).toBe('compact');
  });
});
