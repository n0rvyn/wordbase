import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as podcastService from '../services/podcast.service.js';
import * as episodeService from '../services/episode.service.js';
import * as feedService from '../services/feed.service.js';
import * as podcastAnalytics from '../services/podcast-analytics.service.js';
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

// Serves an episode transcript as plain text. The feed's <podcast:transcript> href
// is built by feedService.episodeTranscriptPath() so the two can't drift. 404 when
// the episode has no transcript (the feed only links it when one exists).
podcastsRouter.get('/episodes/:idOrSlug/transcript.txt', async (c) => {
  const episode = await episodeService.getEpisode(c.req.param('idOrSlug'));
  if (!episode || !episode.transcript) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Transcript not found' } }, 404);
  }
  return new Response(episode.transcript, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});

// Download-tracking redirect (public). The feed's <enclosure> and the site's <audio>
// point here instead of the raw audio URL; we record the hit then 302 to the real
// file (the same URL that works today — Caddy serves /uploads in prod). The standard
// podcast-host pattern: counting happens on this hop, bytes are served by the target.
// Recording is best-effort and must never block or break the redirect.
podcastsRouter.get('/episodes/:idOrSlug/download', async (c) => {
  const episode = await episodeService.getEpisode(c.req.param('idOrSlug'));
  if (!episode || !episode.audioUrl) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Episode audio not found' } }, 404);
  }

  // Count only real GET fetches. Hono dispatches HEAD to this GET handler too, but a
  // HEAD is a probe (Apple Podcasts validates the enclosure with one) — not a download.
  if (c.req.method === 'GET') {
    try {
      await podcastAnalytics.recordPodcastEvent({
        eventType: 'download',
        podcastId: episode.podcastId,
        episodeId: episode.id,
        userAgent: c.req.header('user-agent') || 'unknown',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        referrer: c.req.header('referer') || null,
      });
    } catch {
      // swallow — analytics must not affect the download
    }
  }

  const siteUrl = (process.env.SITE_URL || 'https://norvyn.com').replace(/\/$/, '');
  const target = /^https?:\/\//.test(episode.audioUrl) ? episode.audioUrl : `${siteUrl}${episode.audioUrl}`;
  return c.redirect(target, 302);
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

  // Record the feed poll (best-effort) — podcast clients pulling the feed are the
  // closest proxy for active subscribers. Never let it break feed delivery.
  try {
    await podcastAnalytics.recordPodcastEvent({
      eventType: 'feed_poll',
      podcastId: show.id,
      userAgent: c.req.header('user-agent') || 'unknown',
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    });
  } catch {
    // swallow — analytics must not affect the feed
  }

  const siteUrl = process.env.SITE_URL || 'https://norvyn.com';
  const xml = feedService.buildPodcastFeedXml(show, episodes, siteUrl);
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
});

// ---- Authenticated routes ----

podcastsRouter.post('/', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const body = await c.req.json();
  const show = await podcastService.createPodcast(body);
  return c.json(show, 201);
});

podcastsRouter.put('/:id', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const body = await c.req.json();
  const show = await podcastService.updatePodcast(c.req.param('id'), body);
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  return c.json(show);
});

podcastsRouter.delete('/:id', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const show = await podcastService.deletePodcast(c.req.param('id'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  return c.json({ success: true });
});

podcastsRouter.post('/:id/publish', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const show = await podcastService.publishPodcast(c.req.param('id'));
  if (!show) return c.json({ error: { code: 'NOT_FOUND', message: 'Podcast not found' } }, 404);
  triggerBuild();
  return c.json(show);
});

podcastsRouter.post('/:slug/episodes', authMiddleware, requireScope('podcasts:write'), async (c) => {
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

podcastsRouter.put('/episodes/:id', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const body = await c.req.json();
  const episode = await episodeService.updateEpisode(c.req.param('id'), body);
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  return c.json(episode);
});

podcastsRouter.delete('/episodes/:id', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const episode = await episodeService.deleteEpisode(c.req.param('id'));
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  return c.json({ success: true });
});

podcastsRouter.post('/episodes/:id/publish', authMiddleware, requireScope('podcasts:write'), async (c) => {
  const episode = await episodeService.publishEpisode(c.req.param('id'));
  if (!episode) return c.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
  triggerBuild();
  return c.json(episode);
});

podcastsRouter.post('/:slug/episodes/audio', authMiddleware, requireScope('podcasts:write'), async (c) => {
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
