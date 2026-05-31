import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as podcastService from '../services/podcast.service.js';
import * as episodeService from '../services/episode.service.js';
import * as feedService from '../services/feed.service.js';
import { triggerBuild } from '../services/build.service.js';
import type { AppEnv } from '../types.js';

export const podcastsRouter = new Hono<AppEnv>();

// ---- Public routes ----

podcastsRouter.get('/', async (c) => {
  const { status, page, limit } = c.req.query();
  const result = await podcastService.listPodcasts({
    status,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

podcastsRouter.get('/episodes/:idOrSlug', async (c) => {
  const episode = await episodeService.getEpisode(c.req.param('idOrSlug'));
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  return c.json(episode);
});

podcastsRouter.get('/:slug', async (c) => {
  const show = await podcastService.getPodcast(c.req.param('slug'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  return c.json(show);
});

podcastsRouter.get('/:slug/episodes', async (c) => {
  const show = await podcastService.getPodcast(c.req.param('slug'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  const { status, page, limit } = c.req.query();
  const result = await episodeService.listEpisodes(show.id, {
    status,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

podcastsRouter.get('/:slug/feed.xml', async (c) => {
  const show = await podcastService.getPodcast(c.req.param('slug'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  const { data: episodes } = await episodeService.listEpisodes(show.id, { limit: 200 });
  const siteUrl = process.env.SITE_URL || 'https://norvyn.com';
  const xml = feedService.buildPodcastFeedXml(show, episodes, siteUrl);
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
});

// ---- Authenticated routes ----

podcastsRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const show = await podcastService.createPodcast(body);
  return c.json(show, 201);
});

podcastsRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const show = await podcastService.updatePodcast(c.req.param('id'), body);
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  return c.json(show);
});

podcastsRouter.delete('/:id', authMiddleware, async (c) => {
  const show = await podcastService.deletePodcast(c.req.param('id'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  return c.json({ success: true });
});

podcastsRouter.post('/:id/publish', authMiddleware, async (c) => {
  const show = await podcastService.publishPodcast(c.req.param('id'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  triggerBuild();
  return c.json(show);
});

podcastsRouter.post('/:slug/episodes', authMiddleware, async (c) => {
  const show = await podcastService.getPodcast(c.req.param('slug'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  const body = await c.req.json();

  // Upsert if external fields present, otherwise create
  if (body.externalSource && body.externalId) {
    const { row, created } = await episodeService.upsertEpisodeByExternal(show.id, body);
    return c.json(row, created ? 201 : 200);
  } else {
    const episode = await episodeService.createEpisode(show.id, body);
    return c.json(episode, 201);
  }
});

podcastsRouter.put('/episodes/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const episode = await episodeService.updateEpisode(c.req.param('id'), body);
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  return c.json(episode);
});

podcastsRouter.delete('/episodes/:id', authMiddleware, async (c) => {
  const episode = await episodeService.deleteEpisode(c.req.param('id'));
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  return c.json({ success: true });
});

podcastsRouter.post('/episodes/:id/publish', authMiddleware, async (c) => {
  const episode = await episodeService.publishEpisode(c.req.param('id'));
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  triggerBuild();
  return c.json(episode);
});

podcastsRouter.post('/:slug/episodes/audio', authMiddleware, async (c) => {
  const show = await podcastService.getPodcast(c.req.param('slug'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  const body = await c.req.json();
  const result = await episodeService.uploadEpisodeAudio({
    filename: body.filename,
    base64: body.base64,
    mimeType: body.mimeType,
  });
  return c.json(result, 201);
});
