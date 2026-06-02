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
 * Verify an App Store Connect webhook signature.
 * Apple signs with HMAC-SHA256 over the raw request body and delivers it in the
 * `X-Apple-SIGNATURE` header (per Apple's ASC webhook docs). The header's
 * encoding (hex vs base64) is accepted either way for resilience; the live ASC
 * test delivery is the final confirmation of the exact encoding.
 */
function safeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyAscSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader) return false;
  const hex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const b64 = createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeStrEqual(signatureHeader, hex) || safeStrEqual(signatureHeader, b64);
}

// ---- Public routes ----

// ASC webhook — no authMiddleware, verified by HMAC signature
appsRouter.post('/asc-webhook', async (c) => {
  const secret = process.env.ASC_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } }, 401);
  }

  const rawBody = await c.req.text();
  // App Store Connect delivers the HMAC-SHA256 signature in `X-Apple-SIGNATURE`.
  const sig = c.req.header('x-apple-signature') ?? '';

  if (!verifyAscSignature(rawBody, sig, secret)) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } }, 401);
  }

  // ASC webhook payload shape: { eventType, apiVersion, eventId, eventDate,
  // data: { app: { id }, appStoreVersion: {...} } }. (data.appAppleId is the
  // legacy/App-Store-Server-Notifications shape — accepted as a fallback.)
  let event: { eventType?: string; data?: { app?: { id?: string }; appAppleId?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ ok: true });
  }

  // Only re-sync on events that change the public App Store listing
  // (App Version Status / App Store Release Updated). Match VERSION|RELEASE to
  // stay resilient to Apple's exact eventType enum strings.
  if (!/VERSION|RELEASE/i.test(event.eventType ?? '')) {
    return c.json({ ok: true });
  }

  const appAppleId = event.data?.app?.id ?? event.data?.appAppleId;
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
  try {
    const app = await appService.createApp(body);
    return c.json(app, 201);
  } catch (err) {
    if (appService.isAppStoreIdConflict(err)) {
      return c.json(
        { error: { code: 'CONFLICT', message: 'An app with this App Store ID already exists' } },
        409
      );
    }
    throw err;
  }
});

appsRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  try {
    const app = await appService.updateApp(c.req.param('id'), body);
    if (!app) return c.json({ error: { code: 'NOT_FOUND', message: 'App not found' } }, 404);
    return c.json(app);
  } catch (err) {
    if (appService.isAppStoreIdConflict(err)) {
      return c.json(
        { error: { code: 'CONFLICT', message: 'Another app already uses this App Store ID' } },
        409
      );
    }
    throw err;
  }
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
