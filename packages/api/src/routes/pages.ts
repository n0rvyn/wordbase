import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as pageService from '../services/page.service.js';
import { triggerBuild } from '../services/build.service.js';
import type { AppEnv } from '../types.js';

export const pagesRouter = new Hono<AppEnv>();

pagesRouter.get('/', async (c) => {
  // `?status=` filters the list (parity with posts); no query returns ALL pages,
  // which the public build (web getStaticPaths) depends on to enumerate + filter.
  const { status } = c.req.query();
  const pages = await pageService.listPages({ status });
  return c.json(pages);
});

pagesRouter.get('/:idOrSlug', async (c) => {
  const page = await pageService.getPage(c.req.param('idOrSlug'));
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  return c.json(page);
});

pagesRouter.post('/', authMiddleware, requireScope('pages:write'), async (c) => {
  const body = await c.req.json();
  const page = await pageService.createPage(body);
  // A page created directly published must regenerate the static site.
  if (page.status === 'published') triggerBuild();
  return c.json(page, 201);
});

pagesRouter.put('/:id', authMiddleware, requireScope('pages:write'), async (c) => {
  const body = await c.req.json();
  const before = await pageService.getPage(c.req.param('id'));
  const page = await pageService.updatePage(c.req.param('id'), body);
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  // Rebuild whenever the change touches the public site: the page is (still)
  // published, OR it was published and is now unpublished (so the site drops it).
  // Plain draft edits skip the rebuild.
  if (page.status === 'published' || before?.status === 'published') triggerBuild();
  return c.json(page);
});

pagesRouter.delete('/:id', authMiddleware, requireScope('pages:write'), async (c) => {
  const page = await pageService.deletePage(c.req.param('id'));
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  // The returned row carries its pre-delete status; deleting a published page
  // must remove it from the static site.
  if (page.status === 'published') triggerBuild();
  return c.json({ success: true });
});

pagesRouter.post('/:id/publish', authMiddleware, requireScope('pages:write'), async (c) => {
  const page = await pageService.publishPage(c.req.param('id'));
  if (!page) return c.json({ error: { code: 'NOT_FOUND', message: 'Page not found' } }, 404);
  triggerBuild();
  return c.json(page);
});
