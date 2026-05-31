import type { Post } from './api';
import { decodeEntities } from './home';

export interface CategoryInput {
  slug: string;
  name: string;
  count: number;
}

export interface CategoryItem {
  slug: string;
  name: string;
}

export interface YearGroup {
  year: number;
  posts: Post[];
}

/**
 * Select the top N categories by count (desc), tiebreak name asc.
 * Excludes zero-count categories. Decodes HTML entities in names.
 * Returns up to `limit` items.
 */
export function selectTopCategories(
  cats: CategoryInput[],
  limit: number,
): CategoryItem[] {
  return cats
    .filter(c => c.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map(c => ({ slug: c.slug, name: decodeEntities(c.name) }));
}

/**
 * Group posts by their UTC year, sorted year desc (newest first).
 * Posts within each year are sorted by publishedAt desc.
 * Posts with null publishedAt go into a trailing group with year 0.
 */
export function groupByYear(posts: Post[]): YearGroup[] {
  const map = new Map<number, Post[]>();

  for (const post of posts) {
    const year =
      post.publishedAt !== null
        ? new Date(post.publishedAt * 1000).getUTCFullYear()
        : 0;
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(post);
  }

  // Sort posts within each group by publishedAt desc (nulls treated as 0)
  for (const [, groupPosts] of map) {
    groupPosts.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  }

  // Sort years desc, but push year 0 (null publishedAt) to the end
  const years = [...map.keys()].sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return b - a;
  });

  return years.map(year => ({ year, posts: map.get(year)! }));
}

/**
 * Return the k newest distinct UTC years present in the posts array.
 * Posts with null publishedAt are excluded from year extraction.
 * Result is sorted desc (newest first).
 */
export function selectFullYears(posts: Post[], k: number): number[] {
  const years = new Set<number>();
  for (const post of posts) {
    if (post.publishedAt !== null) {
      years.add(new Date(post.publishedAt * 1000).getUTCFullYear());
    }
  }
  return [...years].sort((a, b) => b - a).slice(0, k);
}

/**
 * Returns 'full' if year is in fullYears (the k newest years), else 'compact'.
 */
export function densityForYear(year: number, fullYears: number[]): 'full' | 'compact' {
  return fullYears.includes(year) ? 'full' : 'compact';
}
