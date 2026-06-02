import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as tagService from '../services/tag.service.js';
import type { AppEnv } from '../types.js';

export const tagsRouter = new Hono<AppEnv>();

tagsRouter.get('/', async (c) => {
  const tags = await tagService.listTags();
  return c.json(tags);
});

tagsRouter.get('/:idOrSlug', async (c) => {
  const tag = await tagService.getTag(c.req.param('idOrSlug'));
  if (!tag) return c.json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } }, 404);
  return c.json(tag);
});

tagsRouter.post('/', authMiddleware, requireScope('tags:write'), async (c) => {
  const body = await c.req.json();
  const tag = await tagService.createTag(body);
  return c.json(tag, 201);
});

tagsRouter.put('/:id', authMiddleware, requireScope('tags:write'), async (c) => {
  const body = await c.req.json();
  const tag = await tagService.updateTag(c.req.param('id'), body);
  if (!tag) return c.json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } }, 404);
  return c.json(tag);
});

tagsRouter.delete('/:id', authMiddleware, requireScope('tags:write'), async (c) => {
  const tag = await tagService.deleteTag(c.req.param('id'));
  if (!tag) return c.json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } }, 404);
  return c.json({ success: true });
});
