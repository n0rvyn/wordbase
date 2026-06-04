import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as analyticsService from '../services/analytics.service.js';
import type { AppEnv } from '../types.js';

export const analyticsRouter = new Hono<AppEnv>();

// POST /pageview - Record page view (public, no auth)
analyticsRouter.post('/pageview', async (c) => {
  const body = await c.req.json();
  if (!body.path) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'path is required' } }, 400);
  }

  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  const record = await analyticsService.recordPageView({
    path: body.path,
    referrer: body.referrer,
    userAgent,
    ipAddress,
  });

  return c.json({ success: true, id: record.id }, 201);
});

// POST /share - Record a share-button click (public, no auth)
analyticsRouter.post('/share', async (c) => {
  const body = await c.req.json();
  if (!body.path || !body.target) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'path and target are required' } }, 400);
  }

  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const record = await analyticsService.recordShare({
    path: body.path,
    target: body.target,
    ipAddress,
  });

  if (!record) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'invalid share target' } }, 400);
  }
  return c.json({ success: true, id: record.id }, 201);
});

// GET /overview - Analytics overview (auth required)
analyticsRouter.get('/overview', authMiddleware, requireScope('analytics:read'), async (c) => {
  const overview = await analyticsService.getOverview();
  return c.json(overview);
});

// GET /posts/:id - Per-post stats (auth required)
analyticsRouter.get('/posts/:id', authMiddleware, requireScope('analytics:read'), async (c) => {
  const result = await analyticsService.getPostPageViews(c.req.param('id'));
  if (!result) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(result);
});
