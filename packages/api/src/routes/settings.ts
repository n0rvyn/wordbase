import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as settingsService from '../services/settings.service.js';
import * as siteService from '../services/site.service.js';
import { triggerBuild } from '../services/build.service.js';
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
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: { message: 'Invalid JSON' } }, 400); }
  try {
    const updated = await settingsService.updateSettings(body);
    const build = await triggerBuild();
    // Persisted settings survive a failed build; the current public build stays intact.
    if (build?.status === 'failed') return c.json({ error: { message: `Settings saved, but publishing could not be queued: ${build.error}` } }, 503);
    c.header('X-Wordbase-Build', build?.status || 'requested');
    return c.json(updated);
  } catch (error) {
    if (error instanceof settingsService.SettingsValidationError) return c.json({ error: { message: error.message } }, 400);
    throw error;
  }
});
