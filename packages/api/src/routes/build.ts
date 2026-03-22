import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as buildService from '../services/build.service.js';
import type { AppEnv } from '../types.js';

export const buildRouter = new Hono<AppEnv>();

buildRouter.post('/trigger', authMiddleware, async (c) => {
  const status = await buildService.triggerBuild();
  return c.json(status);
});

buildRouter.get('/status', authMiddleware, async (c) => {
  const status = buildService.getBuildStatus();
  return c.json(status);
});
