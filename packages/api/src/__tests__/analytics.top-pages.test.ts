import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { pageViews, posts } from '../db/schema.js';
import { getTopPages, getTopPosts } from '../services/analytics.service.js';

const now = Math.floor(Date.now() / 1000);

function view(path: string, n: number) {
  return Array.from({ length: n }, () => ({
    path, referrer: null, userAgent: null, ipHash: null, createdAt: now,
  }));
}

beforeEach(async () => {
  await db.delete(pageViews);
  await db.delete(posts);
  await db.insert(posts).values({
    id: 'p1', slug: 'hello-world', title: 'Hello World', content: '#',
    status: 'published', createdAt: now, updatedAt: now,
  });
});

describe('getTopPages — all visited pages', () => {
  beforeEach(async () => {
    await db.insert(pageViews).values([
      ...view('/posts/hello-world', 5), // post → title
      ...view('/about', 4),             // known static → friendly label
      ...view('/tags/swift', 3),        // unknown path → raw
      ...view('/', 2),                  // home → friendly label
    ]);
  });

  it('ranks ALL pages by views desc, including non-post pages', async () => {
    const rows = await getTopPages(10);
    expect(rows.map(r => r.path)).toEqual(['/posts/hello-world', '/about', '/tags/swift', '/']);
    expect(rows.map(r => r.views)).toEqual([5, 4, 3, 2]);
  });

  it('labels: post→title, known static→friendly, unknown→raw path', async () => {
    const byPath = Object.fromEntries((await getTopPages(10)).map(r => [r.path, r.label]));
    expect(byPath['/posts/hello-world']).toBe('Hello World');
    expect(byPath['/about']).toBe('About');
    expect(byPath['/']).toBe('Home');
    expect(byPath['/tags/swift']).toBe('/tags/swift');
  });

  it('excludes /admin/* and /api/* paths', async () => {
    await db.insert(pageViews).values([
      ...view('/admin/posts', 99),
      ...view('/api/mcp', 88),
    ]);
    const paths = (await getTopPages(10)).map(r => r.path);
    expect(paths).not.toContain('/admin/posts');
    expect(paths).not.toContain('/api/mcp');
  });

  it('respects the limit', async () => {
    expect(await getTopPages(2)).toHaveLength(2);
  });

  it('decodes percent-encoded CJK paths: resolves the post title and returns a readable path', async () => {
    // Slugs are stored decoded; the page-view beacon reports location.pathname,
    // which percent-encodes non-ASCII — so the stored view path is encoded.
    await db.delete(pageViews);
    await db.insert(posts).values({
      id: 'p2', slug: '什么是dbos？这与我何干？', title: '什么是DBOS？这与我何干？',
      content: '#', status: 'published', createdAt: now, updatedAt: now,
    });
    const encoded = '/posts/' + encodeURIComponent('什么是dbos？这与我何干？');
    await db.insert(pageViews).values(view(encoded, 7));

    const rows = await getTopPages(10);
    const row = rows.find(r => r.views === 7)!;
    expect(row.path).toBe('/posts/什么是dbos？这与我何干？'); // readable, not %E4%BB%80...
    expect(row.label).toBe('什么是DBOS？这与我何干？');       // resolved to the post title
  });
});

describe('getTopPages — aggregate a post across its locale/variant paths', () => {
  it('counts a post once, summing zh /posts/<slug> + en /en/posts/<slug>, dominant path as display', async () => {
    await db.insert(pageViews).values([
      ...uaView('/posts/hello-world', 5, 'Mozilla/5.0'),
      ...uaView('/en/posts/hello-world', 2, 'Mozilla/5.0'),
      ...uaView('/about', 3, 'Mozilla/5.0'),
    ]);
    const rows = await getTopPages(10);
    const hw = rows.filter(r => r.label === 'Hello World');
    expect(hw).toHaveLength(1);            // one row, not one-per-locale
    expect(hw[0].views).toBe(7);           // 5 + 2 summed
    expect(hw[0].path).toBe('/posts/hello-world'); // dominant (5 > 2) variant
    // /about stays its own non-post row
    expect(rows.find(r => r.path === '/about')?.views).toBe(3);
  });

  it('sums a .html variant into the same post', async () => {
    await db.insert(pageViews).values([
      ...uaView('/posts/hello-world', 4, 'Mozilla/5.0'),
      ...uaView('/posts/hello-world.html', 1, 'Mozilla/5.0'),
    ]);
    const rows = await getTopPages(10);
    const hw = rows.filter(r => r.label === 'Hello World');
    expect(hw).toHaveLength(1);
    expect(hw[0].views).toBe(5);
  });

  it('does NOT fold /tags/<x> into a post slugged <x> (anchors on the /posts/ route)', async () => {
    // A published post whose slug collides with a tag name.
    await db.insert(posts).values({
      id: 'p-swift', slug: 'swift', title: 'Swift', content: '#',
      status: 'published', createdAt: now, updatedAt: now,
    });
    await db.insert(pageViews).values([
      ...uaView('/posts/swift', 6, 'Mozilla/5.0'), // the real post
      ...uaView('/tags/swift', 4, 'Mozilla/5.0'),  // a tag page — must NOT merge in
    ]);
    const rows = await getTopPages(10);
    const post = rows.find(r => r.path === '/posts/swift');
    const tag = rows.find(r => r.path === '/tags/swift');
    expect(post?.views).toBe(6);          // post keeps only its own views (not 10)
    expect(post?.label).toBe('Swift');
    expect(tag?.views).toBe(4);           // tag row survives as its own raw-path row
    expect(tag?.label).toBe('/tags/swift');
  });
});

describe('getTopPosts — unchanged, post-only (MCP regression guard)', () => {
  it('returns only paths that resolve to a published post', async () => {
    await db.insert(pageViews).values([
      ...view('/posts/hello-world', 5),
      ...view('/about', 99),       // not a post → must be excluded
      ...view('/tags/swift', 99),  // not a post → must be excluded
    ]);
    const rows = await getTopPosts(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'hello-world', title: 'Hello World', views: 5 });
  });
});

// Rows with an explicit userAgent (for bot/locale cases). userAgent null = non-bot.
function uaView(path: string, n: number, userAgent: string | null) {
  return Array.from({ length: n }, () => ({
    path, referrer: null, userAgent, ipHash: null, createdAt: now,
  }));
}

describe('getTopPosts — aggregate by post (dedup across locales) + bot filter', () => {
  it('counts a post once, summing zh /posts/<slug> and en /en/posts/<slug>', async () => {
    await db.insert(pageViews).values([
      ...uaView('/posts/hello-world', 3, 'Mozilla/5.0'),
      ...uaView('/en/posts/hello-world', 2, 'Mozilla/5.0'),
    ]);
    const rows = await getTopPosts(10);
    const hw = rows.filter(r => r.slug === 'hello-world');
    expect(hw).toHaveLength(1);          // one row, not one-per-locale-path
    expect(hw[0].views).toBe(5);         // 3 + 2 summed
  });

  it('excludes bot views from a post total', async () => {
    await db.insert(pageViews).values([
      ...uaView('/posts/hello-world', 5, 'Mozilla/5.0'),
      ...uaView('/posts/hello-world', 4, 'Mozilla/5.0 (compatible; Googlebot/2.1)'),
    ]);
    const rows = await getTopPosts(10);
    expect(rows.find(r => r.slug === 'hello-world')!.views).toBe(5); // bots not counted
  });

  it('resolves percent-encoded CJK slug paths to their post', async () => {
    await db.insert(posts).values({
      id: 'p2', slug: '午夜', title: '午夜', content: '#',
      status: 'published', createdAt: now, updatedAt: now,
    });
    const encoded = '/posts/' + encodeURIComponent('午夜');
    await db.insert(pageViews).values(uaView(encoded, 7, 'Mozilla/5.0'));
    const rows = await getTopPosts(10);
    expect(rows.find(r => r.slug === '午夜')?.views).toBe(7); // currently dropped (raw %.. won't match)
  });
});
