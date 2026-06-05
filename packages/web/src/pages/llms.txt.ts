import type { APIRoute } from 'astro';
import { getPosts, getApps, getPodcasts, getSiteIdentity } from '../lib/api';
import { buildLlmsTxt } from '../lib/llms';

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://norvyn.com/').replace(/\/$/, '');

  // Fetch sections concurrently; the builder is pure and gets called once.
  const [postsRes, appsRes, podcastsRes, id] = await Promise.all([
    getPosts({ status: 'published', limit: 10000 }),
    getApps({ status: 'published', limit: 10000 }),
    getPodcasts({ status: 'published', limit: 10000 }),
    getSiteIdentity(),
  ]);

  const body = buildLlmsTxt(
    { posts: postsRes.data, apps: appsRes.data, podcasts: podcastsRes.data },
    origin,
    id,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
