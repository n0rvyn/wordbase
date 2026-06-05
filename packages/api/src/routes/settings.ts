import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as settingsService from '../services/settings.service.js';
import * as siteService from '../services/site.service.js';
import type { AppEnv } from '../types.js';

export const settingsRouter = new Hono<AppEnv>();

settingsRouter.get('/', authMiddleware, requireScope('settings:read'), async (c) => {
  const settings = await settingsService.getSettings();
  return c.json(settings);
});

// Public — site identity shown in footer / meta is a published read (no auth).
// It is a resolved view (defaults + settings overlay), not the raw settings map,
// so non-whitelisted keys are never exposed.
settingsRouter.get('/site', async (c) => c.json(await siteService.getSiteIdentity()));

settingsRouter.put('/', authMiddleware, requireScope('settings:write'), async (c) => {
  const body = await c.req.json();
  const updated = await settingsService.updateSettings(body);
  return c.json(updated);
});
