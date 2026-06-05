import { describe, it, expect } from 'vitest';

import { buildBlogRssXml } from './blog-feed.js';
import type { Post } from './api.js';

const ORIGIN = 'https://norvyn.com';
const ID = {
  name: 'norvyn',
  description: '独立开发者，做 App、写字、录播客。',
  author: 'norvyn',
  email: 'norvyn@norvyn.com',
  github: 'https://github.com/n0rvyn',
};

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    slug: 'hello-world',
    title: 'Hello World',
    content: '# hello\n\nbody & <stuff>',
    excerpt: 'a short excerpt',
    coverImage: null,
    status: 'published',
    shareToken: null,
    publishedAt: 1_700_000_000, // 2023-11-14T22:13:20Z
    createdAt: 1_700_000_000,
    updatedAt: 1_700_086_400,
    meta: null,
    ...overrides,
  };
}

describe('buildBlogRssXml', () => {
  it('emits RSS 2.0 with channel + atom:link self reference', () => {
    const xml = buildBlogRssXml([makePost()], ORIGIN, ID);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link');
    expect(xml).toContain('rel="self"');
    expect(xml).toContain(`type="application/rss+xml"`);
    expect(xml).toContain('<channel>');
    // Channel <title> comes from identity.name (was hardcoded SITE_NAME)
    expect(xml).toContain(`<title>${ID.name}</title>`);
    // Channel <description> comes from identity.description (CDATA-wrapped)
    expect(xml).toContain(ID.description);
  });

  it('emits one <item> per post with title, link, guid, pubDate, description', () => {
    const posts = [
      makePost({ slug: 'post-a', title: 'Post A' }),
      makePost({ id: 'p2', slug: 'post-b', title: 'Post B', publishedAt: 1_700_100_000 }),
    ];
    const xml = buildBlogRssXml(posts, ORIGIN, ID);
    const itemMatches = xml.match(/<item>/g);
    expect(itemMatches).not.toBeNull();
    expect(itemMatches!.length).toBe(2);

    expect(xml).toContain('<title>Post A</title>');
    expect(xml).toContain(`<link>${ORIGIN}/posts/post-a</link>`);
    expect(xml).toContain(`<guid isPermaLink="true">${ORIGIN}/posts/post-a</guid>`);
    expect(xml).toContain('<title>Post B</title>');
    expect(xml).toContain(`<link>${ORIGIN}/posts/post-b</link>`);
  });

  it('pubDate is RFC-822 (toUTCString format)', () => {
    const xml = buildBlogRssXml([makePost()], ORIGIN, ID);
    // toUTCString format e.g. "Tue, 14 Nov 2023 22:13:20 GMT"
    expect(xml).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
  });

  it('escapes XML special characters in title and description', () => {
    const xml = buildBlogRssXml(
      [makePost({ title: 'A & B <test>', excerpt: 'less <than> & more' })],
      ORIGIN,
      ID,
    );
    // In <title> (raw text node), & and < must be escaped
    expect(xml).toContain('<title>A &amp; B &lt;test&gt;</title>');
    // excerpt can be CDATA-wrapped (special chars don't need escaping inside CDATA)
    expect(xml).toContain('less <than> & more');
  });

  it('produces a valid empty channel when posts is empty', () => {
    const xml = buildBlogRssXml([], ORIGIN, ID);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });

  it('channel contains lastBuildDate derived from newest post (no Date.now())', () => {
    // The newest post (highest publishedAt) is "newer-post"; lastBuildDate must
    // reflect its publishedAt, not the current wall clock.
    const posts = [
      makePost({ id: 'a', slug: 'old', title: 'Old', publishedAt: 1_700_000_000 }),
      makePost({ id: 'b', slug: 'newer-post', title: 'Newer', publishedAt: 1_700_500_000 }),
    ];
    const xml = buildBlogRssXml(posts, ORIGIN, ID);
    // Newer post pubDate is 2024-01-05 — well in the past, should appear in channel
    const newDate = new Date(1_700_500_000 * 1000).toUTCString();
    expect(xml).toContain(`<lastBuildDate>${newDate}</lastBuildDate>`);
  });
});
