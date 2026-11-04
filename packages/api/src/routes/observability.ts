import { getPostObservability } from '../services/post-observability.service.js';
import { getDataQuality } from '../services/data-quality.service.js';
import { observation } from '../services/observation.service.js';
import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as analyticsService from '../services/analytics.service.js';
import * as observabilityService from '../services/observability.service.js';
import * as podcastAnalytics from '../services/podcast-analytics.service.js';
import * as seoHealthService from '../services/seo-health.service.js';
import type { AppEnv } from '../types.js';

// All observability endpoints are auth-protected — they power the admin panel,
// not the public site. Visit ingestion stays on the public /api/analytics/pageview.
export const observabilityRouter = new Hono<AppEnv>();

observabilityRouter.use('*', authMiddleware);
observabilityRouter.use('*', requireScope('observability:read'));
observabilityRouter.use('*', async (c,next) => {
  await next();
  if(c.res.status !== 200) return;
  const rawSection=c.req.path.split('/api/observability/')[1]?.replace('podcast/','podcast-') ?? '';
  const section=rawSection==='posts'?'post-metrics':rawSection;
  const q=c.req.query();
  c.header('X-Wordbase-Observation',JSON.stringify(observation(section,{
    ...(q.days ? {days:Math.max(1,Math.min(365,Math.floor(Number(q.days)||30)))} : {}),
    ...(q.limit ? {limit:Math.max(1,Math.min(50,Math.floor(Number(q.limit)||10)))} : {}),
    ...(q.hours ? {hours:Math.max(1,Math.min(720,Math.floor(Number(q.hours)||24)))} : {}),
    period:['daily','weekly','monthly'].includes(q.period) ? q.period : 'daily'
  })));
});

observabilityRouter.get('/posts', (c) => c.json(getPostObservability(Math.max(1,Math.min(365,Math.floor(Number(c.req.query('days')))||30)), ['daily','weekly','monthly'].includes(c.req.query('period')||'') ? c.req.query('period')! : 'daily')));

// GET /data-quality — aggregate coverage and collection timestamps; no identifiers.
observabilityRouter.get('/data-quality', (c) => c.json(getDataQuality(Math.max(1,Math.min(365,Math.floor(Number(c.req.query('days')))||30)))));

// GET /visits?days=30 — bot-filtered recorded PV, estimated visitors, page visits
observabilityRouter.get('/visits', async (c) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(c.req.query('days'))) || 30));
  return c.json(await analyticsService.getVisitorSummary(days));
});

// GET /trends?period=daily|weekly|monthly — per-bucket PV + uniques + sessions
observabilityRouter.get('/trends', async (c) => {
  const period = ['daily','weekly','monthly'].includes(c.req.query('period') || '') ? c.req.query('period')! : 'daily';
  return c.json(await analyticsService.getVisitTrends(period));
});

// GET /top-posts?limit=10
observabilityRouter.get('/top-posts', async (c) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(c.req.query('limit'))) || 10));
  return c.json(await analyticsService.getTopPosts(limit));
});

// GET /top-pages?limit=10 — ALL visited pages (posts + static + raw paths),
// unlike /top-posts which stays post-only for the MCP analytics tool.
observabilityRouter.get('/top-pages', async (c) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(c.req.query('limit'))) || 10));
  return c.json(await analyticsService.getTopPages(limit, c.req.query('days') ? Math.max(1,Math.min(365,Math.floor(Math.floor(Number(c.req.query('days')))||30))) : undefined));
});

// GET /referrers?limit=10 — top traffic sources, collapsed to host
observabilityRouter.get('/referrers', async (c) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(c.req.query('limit'))) || 10));
  return c.json(await analyticsService.getReferrers(limit, c.req.query('days') ? Math.max(1,Math.min(365,Math.floor(Math.floor(Number(c.req.query('days')))||30))) : undefined));
});

// GET /shares?days=30 — share-button clicks grouped by channel and by page
observabilityRouter.get('/shares', async (c) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(c.req.query('days'))) || 30));
  return c.json(await analyticsService.getShareStats(days));
});

// GET /regions?days=30 — visitor counts by country (ISO alpha-2)
observabilityRouter.get('/regions', async (c) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(c.req.query('days'))) || 30));
  return c.json(await analyticsService.getRegions(days));
});

// GET /devices?days=30 — bot / mobile / desktop / unknown breakdown
observabilityRouter.get('/devices', async (c) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(c.req.query('days'))) || 30));
  return c.json(await analyticsService.getDeviceBreakdown(days));
});

// GET /content — publish frequency, tag distribution, post counts by status
observabilityRouter.get('/content', async (c) => {
  return c.json(await analyticsService.getContentStats());
});

// GET /requests?hours=24 — per-endpoint request timing (p50/p95), status dist, error rate
observabilityRouter.get('/requests', async (c) => {
  const hours = Math.max(1, Math.min(720, Math.floor(Number(c.req.query('hours'))) || 24));
  return c.json(await observabilityService.getRequestMetrics(hours));
});

// GET /system — runtime + database + ops (build / app sync / podcast / pending comments)
observabilityRouter.get('/system', async (c) => {
  return c.json(observabilityService.getSystemStatus());
});

// GET /seo-health — read-only SEO artifact + coverage snapshot (sitemap/robots/rss/llms + canonical host + post excerpt/cover coverage + derived issues)
observabilityRouter.get('/seo-health', (c) => c.json(seoHealthService.getSeoHealth()));

// ---- Podcast consumption analytics (downloads + RSS feed polls) ----

// GET /podcast/summary?days=30 — total + windowed deduped downloads, feed endpoint-day activity (not unique subscribers)
observabilityRouter.get('/podcast/summary', async (c) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(c.req.query('days'))) || 30));
  return c.json(await podcastAnalytics.getPodcastSummary(days));
});

// GET /podcast/trends?period=daily|weekly|monthly — per-bucket deduped downloads + feed polls
observabilityRouter.get('/podcast/trends', async (c) => {
  const period = ['daily','weekly','monthly'].includes(c.req.query('period') || '') ? c.req.query('period')! : 'daily';
  return c.json(await podcastAnalytics.getPodcastTrends(period));
});

// GET /podcast/top-episodes?limit=10 — episodes ranked by deduped downloads
observabilityRouter.get('/podcast/top-episodes', async (c) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(c.req.query('limit'))) || 10));
  return c.json(await podcastAnalytics.getTopEpisodes(limit));
});

// GET /podcast/episodes — every episode with deduped lifetime downloads + recent sparkline
observabilityRouter.get('/podcast/episodes', async (c) => {
  return c.json(await podcastAnalytics.getEpisodeDownloadTable());
});

// GET /podcast/clients?limit=10 — feed-poll user-agent → podcast client distribution
observabilityRouter.get('/podcast/clients', async (c) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(c.req.query('limit'))) || 10));
  return c.json(await podcastAnalytics.getPodcastClients(limit));
});
