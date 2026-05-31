import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authMiddleware } from '../middleware/index.js';
import * as appService from '../services/app.service.js';
import * as appSyncService from '../services/app-sync.service.js';
import { triggerBuild } from '../services/build.service.js';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../types.js';

export const appsRouter = new Hono<AppEnv>();

/**
 * Verify an ASC webhook HMAC-SHA256 signature.
 * Header: X-ASC-Signature
 * Algorithm: HMAC-SHA256 of rawBody, hex-encoded.
 */
export function verifyAscSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHeader, 'hex'));
  } catch {
    return false;
  }
}

// ---- Public routes ----

// ASC webhook — no authMiddleware, verified by HMAC signature
appsRouter.post('/asc-webhook', async (c) => {
  const secret = process.env.ASC_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } }, 401);
  }

  const rawBody = await c.req.text();
  const sig = c.req.header('x-asc-signature') ?? '';

  if (!verifyAscSignature(rawBody, sig, secret)) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } }, 401);
  }

  let event: { notificationType?: string; data?: { appAppleId?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ ok: true });
  }

  if (event.notificationType !== 'APP_STORE_VERSION_CHANGED') {
    return c.json({ ok: true });
  }

  const appAppleId = event.data?.appAppleId;
  if (!appAppleId) {
    return c.json({ ok: true });
  }

  const [matched] = await db.select().from(apps).where(eq(apps.appStoreId, appAppleId)).limit(1);
  if (!matched) {
    return c.json({ ok: true });
  }

  void appSyncService.syncApp(matched.id);
  if (matched.status === 'published') {
    void triggerBuild();
  }

  return c.json({ ok: true });
});

appsRouter.get('/', async (c) => {
  const { status, page, limit } = c.req.query();
  const result = await appService.listApps({
    status,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

appsRouter.get('/:slug', async (c) => {
  const app = await appService.getApp(c.req.param('slug'));
  if (!app) return c.json({ error: { code: 'NOT_FOUND', message: 'App not found' } }, 404);
  return c.json(app);
});

// ---- Authenticated routes ----

// ---- Sync routes (literal /sync before /:id/sync to avoid ambiguity) ----

// /discover must appear before /:id routes to avoid /:id capturing the literal "discover" segment.
appsRouter.post('/discover', authMiddleware, async (c) => {
  const result = await appService.discoverApps();
  return c.json(result);
});

appsRouter.post('/sync', authMiddleware, async (c) => {
  try {
    const result = await appSyncService.syncAllApps();
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'SYNC_FAILED', message } }, 500);
  }
});

appsRouter.post('/:id/sync', authMiddleware, async (c) => {
  const id = c.req.param('id');
  try {
    await appSyncService.syncApp(id);
    // Fire-and-forget build trigger if app is published
    const app = await appService.getApp(id);
    if (app?.status === 'published') {
      void triggerBuild();
    }
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
    }
    return c.json({ error: { code: 'SYNC_FAILED', message } }, 500);
  }
});

appsRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const app = await appService.createApp(body);
  return c.json(app, 201);
});

appsRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const app = await appService.updateApp(c.req.param('id'), body);
  if (!app) return c.json({ error: { code: 'NOT_FOUND', message: 'App not found' } }, 404);
  return c.json(app);
});

appsRouter.delete('/:id', authMiddleware, async (c) => {
  const app = await appService.deleteApp(c.req.param('id'));
  if (!app) return c.json({ error: { code: 'NOT_FOUND', message: 'App not found' } }, 404);
  return c.json({ success: true });
});

appsRouter.post('/:id/publish', authMiddleware, async (c) => {
  const app = await appService.publishApp(c.req.param('id'));
  if (!app) return c.json({ error: { code: 'NOT_FOUND', message: 'App not found' } }, 404);
  triggerBuild();
  return c.json(app);
});
