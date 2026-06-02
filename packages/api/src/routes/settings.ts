import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as settingsService from '../services/settings.service.js';
import type { AppEnv } from '../types.js';

export const settingsRouter = new Hono<AppEnv>();

settingsRouter.get('/', authMiddleware, requireScope('settings:read'), async (c) => {
  const settings = await settingsService.getSettings();
  return c.json(settings);
});

settingsRouter.put('/', authMiddleware, requireScope('settings:write'), async (c) => {
  const body = await c.req.json();
  const updated = await settingsService.updateSettings(body);
  return c.json(updated);
});
