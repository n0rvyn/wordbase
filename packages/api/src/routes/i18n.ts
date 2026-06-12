import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as i18nContent from '../services/i18n-content.service.js';
import type { AppEnv } from '../types.js';

export const i18nRouter = new Hono<AppEnv>();

// GET /render — public, but published-only. No auth: Phase 4 build calls this
// without an API key. Drafts (and unknown entities / unsupported field
// combinations) return 404, never a partial response. The service layer
// enforces both gates; the route just shapes the 404.
i18nRouter.get('/render', async (c) => {
  const type = c.req.query('type');
  const id = c.req.query('id');
  const field = c.req.query('field');
  const lang = c.req.query('lang') ?? '';
  if (!type || !id || !field) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'type, id, field are required' } },
      400
    );
  }
  if (type !== 'post' && type !== 'page' && type !== 'app') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unsupported type' } }, 404);
  }
  if (field !== 'content' && field !== 'title' && field !== 'tagline' && field !== 'features') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unsupported field' } }, 404);
  }
  const result = await i18nContent.renderEntityField(
    type as 'post' | 'page' | 'app',
    id,
    field as 'content' | 'title' | 'tagline' | 'features',
    lang
  );
  if (!result) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  }
  return c.json(result);
});

// GET /pending — auth + i18n:read. Lists cache-missing source units for lang.
i18nRouter.get('/pending', authMiddleware, requireScope('i18n:read'), async (c) => {
  const lang = c.req.query('lang');
  if (!lang) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'lang is required' } },
      400
    );
  }
  const units = await i18nContent.listPendingUnits(lang);
  return c.json(units);
});

// POST /cache — auth + i18n:write. Body = { entries: [...] }. Pass-through
// to putCacheBatch (which preserves the human_edited guard from i18n.service.ts).
i18nRouter.post('/cache', authMiddleware, requireScope('i18n:write'), async (c) => {
  const body = await c.req.json();
  const entries = body?.entries;
  if (!Array.isArray(entries)) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'entries must be an array' } },
      400
    );
  }
  const result = await i18nContent.putTranslations(entries);
  return c.json(result);
});
