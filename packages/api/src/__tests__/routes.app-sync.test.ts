import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, apps } from '../db/schema.js';

type AnyObj = Record<string, unknown>;

// Mock app-sync.service before importing app
vi.mock('../services/app-sync.service.js', () => ({
  syncApp: vi.fn().mockResolvedValue(undefined),
  syncAllApps: vi.fn().mockResolvedValue({ synced: 1, failed: [] }),
}));

// Mock build.service before importing app
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

// Import app AFTER mocks are set up
const { app } = await import('../app.js');
const { syncApp, syncAllApps } = await import('../services/app-sync.service.js');

const syncAppSpy = syncApp as ReturnType<typeof vi.fn>;
const syncAllAppsSpy = syncAllApps as ReturnType<typeof vi.fn>;

let rawKey: string;

async function seedApiKey() {
  rawKey = 'synctest-key123';
  const now = Math.floor(Date.now() / 1000);
  await db.insert(apiKeys).values({
    id: nanoid(),
    name: 'Sync Test Key',
    keyPrefix: rawKey.slice(0, 8),
    keyHash: await bcrypt.hash(rawKey, 10),
    permissions: '["*"]',
    createdAt: now,
  }).onConflictDoNothing();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${rawKey}`,
    'content-type': 'application/json',
  };
}

beforeAll(async () => {
  await seedApiKey();
});

afterEach(async () => {
  await db.delete(apps);
  syncAppSpy.mockClear();
  syncAllAppsSpy.mockClear();
});

describe('POST /api/apps/:id/sync', () => {
  it('returns 401 without auth', async () => {
    const res = await app.request('/api/apps/some-id/sync', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 and calls syncApp with the id', async () => {
    // Insert an app to sync
    const appId = nanoid();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(apps).values({
      id: appId,
      slug: 'sync-test-app',
      name: 'Sync Test App',
      appStoreId: '361304891',
      status: 'draft',
      platform: 'iOS',
      createdAt: now,
      updatedAt: now,
      featured: 0,
    });

    const res = await app.request(`/api/apps/${appId}/sync`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(syncAppSpy).toHaveBeenCalledWith(appId);
  });
});

describe('POST /api/apps/sync', () => {
  it('returns 401 without auth', async () => {
    const res = await app.request('/api/apps/sync', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 and calls syncAllApps', async () => {
    const res = await app.request('/api/apps/sync', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(syncAllAppsSpy).toHaveBeenCalled();
    const body = await res.json() as AnyObj;
    expect(typeof body.synced).toBe('number');
  });

  it('/sync literal route does not get swallowed by /:id/sync pattern', async () => {
    // This verifies route registration order: /sync must be matched as literal, not as id="sync"
    const res = await app.request('/api/apps/sync', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    // syncAllApps (not syncApp) should have been called
    expect(syncAllAppsSpy).toHaveBeenCalled();
    expect(syncAppSpy).not.toHaveBeenCalled();
  });
});

describe('MCP registerTools includes app_sync and app_sync_all', () => {
  it('registers app_sync, app_sync_all, and keeps existing tools', async () => {
    const { registerTools } = await import('../mcp/tools.js');

    const registeredTools: string[] = [];
    const fakeServer = {
      tool: (name: string) => {
        registeredTools.push(name);
      },
    };

    registerTools(fakeServer as Parameters<typeof registerTools>[0]);

    expect(registeredTools).toContain('app_sync');
    expect(registeredTools).toContain('app_sync_all');
    // Existing tools must still be present
    expect(registeredTools).toContain('app_create');
    expect(registeredTools).toContain('blog_create_post');
  });
});
