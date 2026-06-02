import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as buildService from '../services/build.service.js';
import type { AppEnv } from '../types.js';

export const buildRouter = new Hono<AppEnv>();

buildRouter.post('/trigger', authMiddleware, requireScope('build:trigger'), async (c) => {
  const status = await buildService.triggerBuild();
  return c.json(status);
});

buildRouter.get('/status', authMiddleware, requireScope('build:read'), async (c) => {
  const status = buildService.getBuildStatus();
  return c.json(status);
});
