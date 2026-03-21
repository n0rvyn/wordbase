import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as settingsService from '../services/settings.service.js';
import type { AppEnv } from '../types.js';

export const settingsRouter = new Hono<AppEnv>();

settingsRouter.get('/', authMiddleware, async (c) => {
  const settings = await settingsService.getSettings();
  return c.json(settings);
});

settingsRouter.put('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const updated = await settingsService.updateSettings(body);
  return c.json(updated);
});
