import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as redirectService from '../services/redirect.service.js';
import type { AppEnv } from '../types.js';

export const redirectsRouter = new Hono<AppEnv>();

redirectsRouter.get('/', authMiddleware, async (c) => {
  const redirects = await redirectService.listRedirects();
  return c.json(redirects);
});

redirectsRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  if (!body.fromPath || !body.toPath) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'fromPath and toPath are required' } }, 400);
  }
  const redirect = await redirectService.createRedirect(body);
  return c.json(redirect, 201);
});

redirectsRouter.delete('/:id', authMiddleware, async (c) => {
  const deleted = await redirectService.deleteRedirect(c.req.param('id'));
  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Redirect not found' } }, 404);
  return c.json({ success: true });
});
