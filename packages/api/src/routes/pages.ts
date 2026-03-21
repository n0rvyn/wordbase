import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as pageService from '../services/page.service.js';
import type { AppEnv } from '../types.js';

export const pagesRouter = new Hono<AppEnv>();

pagesRouter.get('/', async (c) => {
  const pages = await pageService.listPages();
  return c.json(pages);
});

pagesRouter.get('/:idOrSlug', async (c) => {
  const page = await pageService.getPage(c.req.param('idOrSlug'));
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  return c.json(page);
});

pagesRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const page = await pageService.createPage(body);
  return c.json(page, 201);
});

pagesRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const page = await pageService.updatePage(c.req.param('id'), body);
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  return c.json(page);
});

pagesRouter.delete('/:id', authMiddleware, async (c) => {
  const page = await pageService.deletePage(c.req.param('id'));
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  return c.json({ success: true });
});
