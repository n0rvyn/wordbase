// Content-bilingual Phase 5: this feed stays zh-only. An English RSS feed is
// intentionally NOT produced this phase (same deferral tier as podcast bilingual);
// the bilingual surface is the /en HTML pages + sitemap hreflang alternates.
import type { APIRoute } from 'astro';
import { getPosts, getSiteIdentity } from '../lib/api';
import { buildBlogRssXml } from '../lib/blog-feed';

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://norvyn.com/').replace(/\/$/, '');
  const id = await getSiteIdentity();
  const { data } = await getPosts({ status: 'published', limit: 10000 });
  const sorted = [...data].sort(
    (a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
  );
  return new Response(buildBlogRssXml(sorted, origin, id), {
    headers: { 'Content-Type': 'application/rss+xml' },
  });
};
