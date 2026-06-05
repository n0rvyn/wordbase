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
