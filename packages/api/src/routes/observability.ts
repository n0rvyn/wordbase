import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as analyticsService from '../services/analytics.service.js';
import * as observabilityService from '../services/observability.service.js';
import * as podcastAnalytics from '../services/podcast-analytics.service.js';
import type { AppEnv } from '../types.js';

// All observability endpoints are auth-protected — they power the admin panel,
// not the public site. Visit ingestion stays on the public /api/analytics/pageview.
export const observabilityRouter = new Hono<AppEnv>();

observabilityRouter.use('*', authMiddleware);
observabilityRouter.use('*', requireScope('observability:read'));

// GET /visits?days=30 — raw PV, unique visitors, deduplicated sessions
observabilityRouter.get('/visits', async (c) => {
  const days = Math.max(1, Math.min(365, Number(c.req.query('days')) || 30));
  return c.json(await analyticsService.getVisitorSummary(days));
});

// GET /trends?period=daily|weekly|monthly — per-bucket PV + uniques + sessions
observabilityRouter.get('/trends', async (c) => {
  const period = c.req.query('period') || 'daily';
  return c.json(await analyticsService.getVisitTrends(period));
});

// GET /top-posts?limit=10
observabilityRouter.get('/top-posts', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit')) || 10));
  return c.json(await analyticsService.getTopPosts(limit));
});

// GET /referrers?limit=10 — top traffic sources, collapsed to host
observabilityRouter.get('/referrers', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit')) || 10));
  return c.json(await analyticsService.getReferrers(limit));
});

// GET /devices — bot / mobile / desktop / unknown breakdown
observabilityRouter.get('/devices', async (c) => {
  return c.json(await analyticsService.getDeviceBreakdown());
});

// GET /content — publish frequency, tag distribution, post counts by status
observabilityRouter.get('/content', async (c) => {
  return c.json(await analyticsService.getContentStats());
});

// GET /requests?hours=24 — per-endpoint request timing (p50/p95), status dist, error rate
observabilityRouter.get('/requests', async (c) => {
  const hours = Math.max(1, Math.min(720, Number(c.req.query('hours')) || 24));
  return c.json(await observabilityService.getRequestMetrics(hours));
});

// GET /system — runtime + database + ops (build / app sync / podcast / pending comments)
observabilityRouter.get('/system', async (c) => {
  return c.json(observabilityService.getSystemStatus());
});

// ---- Podcast consumption analytics (downloads + RSS feed polls) ----

// GET /podcast/summary?days=30 — total + windowed deduped downloads, subscriber estimate
observabilityRouter.get('/podcast/summary', async (c) => {
  const days = Math.max(1, Math.min(365, Number(c.req.query('days')) || 30));
  return c.json(await podcastAnalytics.getPodcastSummary(days));
});

// GET /podcast/trends?period=daily|weekly|monthly — per-bucket deduped downloads + feed polls
observabilityRouter.get('/podcast/trends', async (c) => {
  const period = c.req.query('period') || 'daily';
  return c.json(await podcastAnalytics.getPodcastTrends(period));
});

// GET /podcast/top-episodes?limit=10 — episodes ranked by deduped downloads
observabilityRouter.get('/podcast/top-episodes', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit')) || 10));
  return c.json(await podcastAnalytics.getTopEpisodes(limit));
});

// GET /podcast/episodes — every episode with deduped lifetime downloads + recent sparkline
observabilityRouter.get('/podcast/episodes', async (c) => {
  return c.json(await podcastAnalytics.getEpisodeDownloadTable());
});

// GET /podcast/clients?limit=10 — feed-poll user-agent → podcast client distribution
observabilityRouter.get('/podcast/clients', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit')) || 10));
  return c.json(await podcastAnalytics.getPodcastClients(limit));
});
