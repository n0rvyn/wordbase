import { stripMarkdown, type Post, type SiteIdentity } from './api.js';

// Mirrors packages/api/src/services/feed.service.ts:xmlEscape — duplicated here
// to keep web lib self-contained (no cross-package imports). RSS consumers
// REQUIRE that &, <, >, ", ' be escaped in raw text nodes; CDATA sections
// tolerate them, so we use CDATA for human-readable fields (title in some
// readers, description) and escape where the spec demands it.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdataWrap(s: string): string {
  // Split on ']]>' so the sequence never appears inside a CDATA section.
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function pubDateFor(post: Post): Date | null {
  const ts = post.publishedAt ?? post.createdAt;
  return ts ? new Date(ts * 1000) : null;
}

/**
 * Build an RSS 2.0 XML string for the blog's published posts.
 * Pure: derives lastBuildDate from the newest post (no Date.now()).
 * Caller passes `origin` (already trimmed of trailing slash) so the feed
 * self-reference is always absolute and matches the canonical host.
 */
export function buildBlogRssXml(posts: Post[], origin: string, id: SiteIdentity): string {
  const selfHref = `${origin}/rss.xml`;
  // Newest first — used both for sort and for lastBuildDate.
  const sorted = [...posts].sort(
    (a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
  );
  const newest = sorted[0];
  const lastBuildSeconds = newest
    ? (newest.publishedAt ?? newest.createdAt)
    : Math.floor(Date.now() / 1000); // empty feed: RFC says channel needs a date, use now
  const lastBuildDate = new Date(lastBuildSeconds * 1000).toUTCString();

  const items = sorted
    .map((post) => {
      const url = `${origin}/posts/${post.slug}`;
      const pub = pubDateFor(post);
      const descriptionText = post.excerpt ?? stripMarkdown(post.content, 200);
      const pubDate = pub ? pub.toUTCString() : '';
      return [
        `    <item>`,
        `      <title>${xmlEscape(post.title)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <description>${cdataWrap(descriptionText)}</description>`,
        `    </item>`,
      ].join('\n');
    })
    .join('\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${xmlEscape(id.name)}</title>`,
    `    <link>${xmlEscape(`${origin}/`)}</link>`,
    `    <description>${cdataWrap(id.description)}</description>`,
    `    <language>zh-CN</language>`,
    `    <atom:link href="${xmlEscape(selfHref)}" rel="self" type="application/rss+xml" />`,
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
    `  </channel>`,
    `</rss>`,
  ]
    .filter(Boolean)
    .join('\n');
}
