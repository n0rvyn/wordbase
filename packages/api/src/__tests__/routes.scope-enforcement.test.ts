import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, posts, apps } from '../db/schema.js';
import { hasScope } from '../middleware/auth.js';

// triggerBuild must not actually shell out during the test.
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: vi.fn().mockResolvedValue(undefined) };
});

const { app } = await import('../app.js');

// Distinct 8-char prefixes (validateBearerToken looks up by token.slice(0,8)).
const KEYS = {
  full: 'wbfull-aaaaaaaa', //  ["*"]
  admin: 'wbadmin-bbbbbbb', // ["admin"] (legacy full-admin sentinel)
  posts: 'wbposts-ccccccc', // ["posts:write"]
  apps: 'wbapps-ddddddddd', // ["apps:read","apps:write"]
};

async function seedKey(raw: string, name: string, permissions: string) {
  await db.insert(apiKeys).values({
    id: nanoid(),
    name,
    keyPrefix: raw.slice(0, 8),
    keyHash: await bcrypt.hash(raw, 10),
    permissions,
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing();
}

function bearer(raw: string) {
  return { Authorization: `Bearer ${raw}`, 'content-type': 'application/json' };
}

beforeAll(async () => {
  await seedKey(KEYS.full, 'full', '["*"]');
  await seedKey(KEYS.admin, 'admin-literal', '["admin"]');
  await seedKey(KEYS.posts, 'posts-only', '["posts:write"]');
  await seedKey(KEYS.apps, 'apps-only', '["apps:read","apps:write"]');
});

afterEach(async () => {
  await db.delete(posts);
  await db.delete(apps);
});

describe('hasScope', () => {
  it('the * wildcard grants every scope', () => {
    expect(hasScope(['*'], 'posts:write')).toBe(true);
    expect(hasScope(['*'], 'build:trigger')).toBe(true);
  });
  it('the legacy "admin" sentinel grants every scope', () => {
    expect(hasScope(['admin'], 'build:trigger')).toBe(true);
  });
  it('an exact scope matches', () => {
    expect(hasScope(['posts:write'], 'posts:write')).toBe(true);
  });
  it('a domain wildcard matches any action in that domain', () => {
    expect(hasScope(['apps:*'], 'apps:write')).toBe(true);
    expect(hasScope(['apps:*'], 'apps:read')).toBe(true);
  });
  it('denies unrelated, insufficient, or empty scopes', () => {
    expect(hasScope(['posts:write'], 'media:write')).toBe(false);
    expect(hasScope(['apps:read'], 'apps:write')).toBe(false);
    expect(hasScope([], 'posts:write')).toBe(false);
    expect(hasScope(undefined, 'posts:write')).toBe(false);
  });
});

describe('per-route scope enforcement', () => {
  it('a missing key still returns 401 (auth runs before scope)', async () => {
    const res = await app.request('/api/build/trigger', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('a posts-only key is 403d on build:trigger and apps:write routes', async () => {
    const build = await app.request('/api/build/trigger', { method: 'POST', headers: bearer(KEYS.posts) });
    expect(build.status).toBe(403);
    const appCreate = await app.request('/api/apps', {
      method: 'POST', headers: bearer(KEYS.posts), body: JSON.stringify({ name: 'X' }),
    });
    expect(appCreate.status).toBe(403);
  });

  it('a posts-only key may create a post (scope satisfied)', async () => {
    const res = await app.request('/api/posts', {
      method: 'POST', headers: bearer(KEYS.posts),
      body: JSON.stringify({ title: 'Hello', content: 'Body', status: 'draft' }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('a full-admin (*) key passes build:trigger', async () => {
    const res = await app.request('/api/build/trigger', { method: 'POST', headers: bearer(KEYS.full) });
    expect(res.status).not.toBe(403);
  });

  it('a legacy ["admin"] key is treated as full admin', async () => {
    const res = await app.request('/api/build/trigger', { method: 'POST', headers: bearer(KEYS.admin) });
    expect(res.status).not.toBe(403);
  });

  it('an apps-scoped key may create an app but is 403d on posts:write', async () => {
    const ok = await app.request('/api/apps', {
      method: 'POST', headers: bearer(KEYS.apps), body: JSON.stringify({ name: 'My App' }),
    });
    expect(ok.status).not.toBe(401);
    expect(ok.status).not.toBe(403);

    const denied = await app.request('/api/posts', {
      method: 'POST', headers: bearer(KEYS.apps), body: JSON.stringify({ title: 'T', content: 'C' }),
    });
    expect(denied.status).toBe(403);
  });
});
