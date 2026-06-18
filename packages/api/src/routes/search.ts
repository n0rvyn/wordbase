import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import * as searchService from '../services/search.service.js';

export const searchRouter = new Hono<AppEnv>();

searchRouter.get('/', async (c) => {
  const q = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit')) || 20;
  const results = await searchService.searchPosts(q, limit);
  return c.json({ results });
});
