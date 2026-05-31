/**
 * Tests for POST /api/apps/asc-webhook
 *
 * App Store Connect signs webhooks with HMAC-SHA256 over the raw request body,
 * delivered in the `X-Apple-SIGNATURE` header (verified against Apple's ASC
 * webhook docs). verifyAscSignature accepts hex OR base64; the live ASC test
 * delivery is the final confirmation of the exact encoding.
 * Payload shape: { eventType, data: { app: { id } } }.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';

type AnyObj = Record<string, unknown>;

const WEBHOOK_SECRET = 'test-webhook-secret-abc';

// Mock app-sync.service before importing app
vi.mock('../services/app-sync.service.js', () => ({
  syncApp: vi.fn().mockResolvedValue(undefined),
  syncAllApps: vi.fn().mockResolvedValue({ synced: 0, failed: [] }),
}));

// Mock build.service
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

// Import app AFTER mocks are set up
const { app } = await import('../app.js');
const { syncApp } = await import('../services/app-sync.service.js');
const syncAppSpy = syncApp as ReturnType<typeof vi.fn>;

// Import the pure verifyAscSignature function from routes/apps.ts
const { verifyAscSignature } = await import('../routes/apps.js');

function makeSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

const VERSION_EVENT_BODY = JSON.stringify({
  eventType: 'APP_STORE_VERSION_STATE_CHANGED',
  data: {
    app: { id: '361304891' },
    appStoreVersion: { id: 'ver-001', versionString: '1.2.3', state: 'READY_FOR_SALE' },
  },
});

const UNRELATED_EVENT_BODY = JSON.stringify({
  eventType: 'BETA_FEEDBACK_CRASH_SUBMITTED',
  data: {
    app: { id: '361304891' },
  },
});

beforeAll(async () => {
  process.env.ASC_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(async () => {
  await db.delete(apps);
  syncAppSpy.mockClear();
});

describe('verifyAscSignature (pure function)', () => {
  it('returns true for a correct HMAC-SHA256 signature', () => {
    const sig = makeSignature('hello', WEBHOOK_SECRET);
    expect(verifyAscSignature('hello', sig, WEBHOOK_SECRET)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    expect(verifyAscSignature('hello', 'deadsignature', WEBHOOK_SECRET)).toBe(false);
  });

  it('returns false for empty signature', () => {
    expect(verifyAscSignature('hello', '', WEBHOOK_SECRET)).toBe(false);
  });

  it('accepts a base64-encoded signature too (encoding-tolerant)', () => {
    const b64 = createHmac('sha256', WEBHOOK_SECRET).update('hello').digest('base64');
    expect(verifyAscSignature('hello', b64, WEBHOOK_SECRET)).toBe(true);
  });
});

describe('POST /api/apps/asc-webhook', () => {
  it('returns 401 when signature header is missing', async () => {
    const res = await app.request('/api/apps/asc-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: VERSION_EVENT_BODY,
    });
    expect(res.status).toBe(401);
    expect(syncAppSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is wrong', async () => {
    const res = await app.request('/api/apps/asc-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apple-signature': 'badsignature',
      },
      body: VERSION_EVENT_BODY,
    });
    expect(res.status).toBe(401);
    expect(syncAppSpy).not.toHaveBeenCalled();
  });

  it('returns 200 and calls syncApp when signature is valid and app version event matches a known app', async () => {
    const appId = nanoid();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(apps).values({
      id: appId,
      slug: 'webhook-app',
      name: 'Webhook App',
      appStoreId: '361304891',
      status: 'draft',
      platform: 'iOS',
      createdAt: now,
      updatedAt: now,
      featured: 0,
    });

    const sig = makeSignature(VERSION_EVENT_BODY, WEBHOOK_SECRET);
    const res = await app.request('/api/apps/asc-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apple-signature': sig,
      },
      body: VERSION_EVENT_BODY,
    });
    expect(res.status).toBe(200);
    expect(syncAppSpy).toHaveBeenCalledWith(appId);
  });

  it('returns 200 and does NOT call syncApp when no matching app found', async () => {
    // No apps inserted — appStoreId 361304891 has no match
    const sig = makeSignature(VERSION_EVENT_BODY, WEBHOOK_SECRET);
    const res = await app.request('/api/apps/asc-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apple-signature': sig,
      },
      body: VERSION_EVENT_BODY,
    });
    expect(res.status).toBe(200);
    expect(syncAppSpy).not.toHaveBeenCalled();
  });

  it('returns 200 no-op for unrelated event type', async () => {
    const appId = nanoid();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(apps).values({
      id: appId,
      slug: 'noop-app',
      name: 'Noop App',
      appStoreId: '361304891',
      status: 'draft',
      platform: 'iOS',
      createdAt: now,
      updatedAt: now,
      featured: 0,
    });

    const sig = makeSignature(UNRELATED_EVENT_BODY, WEBHOOK_SECRET);
    const res = await app.request('/api/apps/asc-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apple-signature': sig,
      },
      body: UNRELATED_EVENT_BODY,
    });
    expect(res.status).toBe(200);
    expect(syncAppSpy).not.toHaveBeenCalled();
  });
});
