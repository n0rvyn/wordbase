import type { APIRoute } from 'astro';
import { getPosts, getApps, getPodcasts, getEpisodes } from '../lib/api';
export const GET: APIRoute = async () => {
  const [posts, apps, shows] = await Promise.all([
    getPosts({ status: 'published', limit: 10000 }),
    getApps({ status: 'published', limit: 10000 }),
    getPodcasts({ status: 'published', limit: 10000 }),
  ]);
  const episodes = (await Promise.all(shows.data.map(show => getEpisodes(show.slug, { status: 'published', limit: 10000 })))).flatMap(group => group.data);
  const entries = [
    ...posts.data.map(post => ({ kind: 'writing', title: post.title, detail: '', path: `/posts/${post.slug}` })),
    ...apps.data.map(app => ({ kind: 'apps', title: app.name, detail: app.platform || '', path: `/apps/${app.slug}` })),
    ...episodes.map(ep => ({ kind: 'podcast', title: ep.title, detail: ep.episodeNumber != null ? `EP.${ep.episodeNumber}` : '', path: `/podcast/${ep.slug}` })),
  ];
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
