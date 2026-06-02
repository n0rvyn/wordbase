import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as mediaService from '../services/media.service.js';
import type { AppEnv } from '../types.js';

export const mediaRouter = new Hono<AppEnv>();

mediaRouter.get('/', authMiddleware, requireScope('media:read'), async (c) => {
  const { page, limit } = c.req.query();
  const result = await mediaService.listMedia({
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

mediaRouter.get('/:id', authMiddleware, requireScope('media:read'), async (c) => {
  const media = await mediaService.getMedia(c.req.param('id'));
  if (!media) return c.json({ error: { code: 'NOT_FOUND', message: 'Media not found' } }, 404);
  return c.json(media);
});

mediaRouter.post('/', authMiddleware, requireScope('media:write'), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'No file provided' } }, 400);
  }

  const altText = formData.get('alt_text') as string | null;

  try {
    const record = await mediaService.uploadMedia({ file, altText: altText || undefined });
    return c.json(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ error: { code: 'UPLOAD_ERROR', message } }, 400);
  }
});

mediaRouter.delete('/:id', authMiddleware, requireScope('media:write'), async (c) => {
  const deleted = await mediaService.deleteMedia(c.req.param('id'));
  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Media not found' } }, 404);
  return c.json({ success: true });
});
