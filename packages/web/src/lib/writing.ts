import { getPosts, getCategories, getRendition, type Post } from './api';
import { decodeEntities } from './home';
import { localizePost } from './localize';
import type { Locale } from './locale';

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

/**
 * Load + locale-shape the archives page data. Single source for the zh shell
 * (pages/archives.astro) and the en shell (pages/en/archives.astro). en
 * localizes only the post title (content is used solely for read-time, which
 * is language-agnostic); on a cache miss the title falls back to the source.
 */
export async function loadArchivesData(
  locale: Locale,
): Promise<{ groups: YearGroup[]; totalPosts: number }> {
  const { data: postsRaw } = await getPosts({ status: 'published', limit: 10000 });
  let posts = [...postsRaw].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  if (locale === 'en') {
    posts = await Promise.all(
      posts.map(async (p) => ({
        ...p,
        title: (await getRendition('post', p.id, 'title', 'en')) ?? p.title,
      })),
    );
  }
  return { groups: groupByYear(posts), totalPosts: posts.length };
}

export interface WritingIndexData {
  topCats: CategoryItem[];
  featuredVariants: { key: string; post: Post }[];
  groups: YearGroup[];
  fullYears: number[];
  /** post id → all its category slugs (for the chip-filter data-cats attr). */
  postCatSlugs: Map<string, string[]>;
  /** post id → first category display name, decoded ('' when uncategorized). */
  catNameById: Map<string, string>;
}

/**
 * Load + locale-shape the writing-index data. Single source for the zh shell
 * (pages/writing/index.astro) and the en shell (pages/en/writing/index.astro).
 * en fully localizes each post (title + content/excerpt — the index shows
 * both). Category names come from the source rows (categories are not yet
 * translated). All the featured-variant / density / chip data is precomputed
 * here so the shared body stays pure presentation.
 */
export async function loadWritingIndexData(locale: Locale): Promise<WritingIndexData> {
  const { data: postsRaw } = await getPosts({ status: 'published', limit: 10000 });
  const sorted = [...postsRaw].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const posts = locale === 'en'
    ? await Promise.all(sorted.map((p) => localizePost(p, 'en')))
    : sorted;

  // Per-post category slug list + per-category published count.
  const cats = await getCategories();
  const postCatSlugs = new Map<string, string[]>();
  const catCount = new Map<string, number>();
  for (const cat of cats) {
    const { data: catPosts } = await getPosts({ status: 'published', category: cat.slug, limit: 10000 });
    catCount.set(cat.slug, catPosts.length);
    for (const p of catPosts) {
      const existing = postCatSlugs.get(p.id) ?? [];
      if (!existing.includes(cat.slug)) existing.push(cat.slug);
      postCatSlugs.set(p.id, existing);
    }
  }

  const topCats = selectTopCategories(
    cats.map((c) => ({ slug: c.slug, name: c.name, count: catCount.get(c.slug) ?? 0 })),
    6,
  );

  const featured = posts[0] ?? null;
  const archive = posts.slice(1);
  const featuredVariants = ([
    { key: 'all', post: featured },
    ...topCats.map((c) => ({
      key: c.slug,
      post: posts.find((p) => (postCatSlugs.get(p.id) ?? []).includes(c.slug)) ?? null,
    })),
  ].filter((v) => v.post) as { key: string; post: Post }[]);
  const fullYears = selectFullYears(posts, 2);
  const groups = groupByYear(archive);

  // First-category display name per post (mirrors the old firstCatName helper).
  const catNameById = new Map<string, string>();
  for (const p of posts) {
    const slug = (postCatSlugs.get(p.id) ?? [])[0];
    const cat = slug ? cats.find((c) => c.slug === slug) : undefined;
    catNameById.set(p.id, cat ? decodeEntities(cat.name) : '');
  }

  return { topCats, featuredVariants, groups, fullYears, postCatSlugs, catNameById };
}
