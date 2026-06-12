import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys, pages, posts, apps } from '../db/schema.js';
import { resetNewTables } from './helpers.js';

// triggerBuild must not actually shell out during the test.
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: vi.fn().mockResolvedValue(undefined) };
});

const { app } = await import('../app.js');

// Distinct 8-char prefixes (validateBearerToken looks up by token.slice(0,8)).
const KEYS = {
  full: 'i18nfull-aaaaaaa', // ["*"]
  ro: 'i18nro-bbbbbbbb',    // ["i18n:read"]  — can hit /pending, NOT /cache
  wo: 'i18nwo-cccccccc',    // ["i18n:write"] — can hit /cache, NOT /pending
  both: 'i18nboth-ddddddd', // ["i18n:read","i18n:write"]
  posts: 'i18nposts-eeeeee', // ["posts:write"] — wrong domain
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

const ACCEPT = 'application/json, text/event-stream';

function mcpHeaders(raw?: string, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', accept: ACCEPT };
  if (raw) h['authorization'] = `Bearer ${raw}`;
  if (sessionId) h['mcp-session-id'] = sessionId;
  return h;
}

const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
});

async function openMcpSession(raw: string): Promise<string> {
  const res = await app.request('/api/mcp', {
    method: 'POST', headers: mcpHeaders(raw), body: INIT_BODY,
  });
  expect(res.status).toBe(200);
  const sid = res.headers.get('mcp-session-id');
  expect(sid).toBeTruthy();
  return sid!;
}

beforeAll(async () => {
  await seedKey(KEYS.full, 'i18n-full', '["*"]');
  await seedKey(KEYS.ro, 'i18n-readonly', '["i18n:read"]');
  await seedKey(KEYS.wo, 'i18n-writeonly', '["i18n:write"]');
  await seedKey(KEYS.both, 'i18n-both', '["i18n:read","i18n:write"]');
  await seedKey(KEYS.posts, 'i18n-posts', '["posts:write"]');
});

afterEach(async () => {
  await resetNewTables();
});

beforeEach(async () => {
  // resetNewTables runs afterEach; for tests that need a published entity,
  // build it here.
});

// ---------------------------------------------------------------------------
// REST: render (public, published-only)
// ---------------------------------------------------------------------------

describe('GET /api/i18n/render (public, published-only)', () => {
  it('returns 200 with zh fallback for a published page with no cache row', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'render-pub', title: 'P', content: '# 你好\n\n世界', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=content&lang=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string; coverage: { hit: number; total: number } };
    expect(body.value).toContain('你好');
    expect(body.value).toContain('世界');
    expect(body.coverage).toEqual({ hit: 0, total: 2 });
  });

  it('returns 404 for a draft page (no leak)', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'render-draft', title: 'D', content: '# 草稿', status: 'draft',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=content&lang=en`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown (type, field) combination (e.g. app.description is ASC-owned)', async () => {
    const res = await app.request('/api/i18n/render?type=app&id=anything&field=description&lang=en');
    expect(res.status).toBe(404);
  });

  it('returns 400 when required query params are missing', async () => {
    const res = await app.request('/api/i18n/render?type=page');
    expect(res.status).toBe(400);
  });

  it('returns the en text after a POST /cache primes the block', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'render-hit', title: 'P', content: '# 标题\n\n正文', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    // compute the block hashes the same way i18n.service.ts does
    const { splitBlocks } = await import('../services/i18n.service.js');
    const blocks = splitBlocks(page.content);
    // prime the cache
    const entries = blocks.map(b => ({
      sourceHash: b.hash, lang: 'en', text: `[en] ${b.raw}`, model: 'claude-test', humanEdited: false,
    }));
    const cache = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.both), body: JSON.stringify({ entries }),
    });
    expect(cache.status).toBe(200);
    // now render — coverage should be full hit
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=content&lang=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string; coverage: { hit: number; total: number } };
    expect(body.coverage).toEqual({ hit: blocks.length, total: blocks.length });
    for (const b of blocks) {
      expect(body.value).toContain(`[en] ${b.raw}`);
    }
  });

  // ---- field=title (Phase 4 single-unit treatment) -----------------------------
  // title is a single whole-string unit (mirrors app.tagline): the render key
  // is hashBlock(title) directly so titles with markdown characters (e.g.
  // `code`, *italic*, [link](…)) still hit the cache. Never splitBlocks.

  it('field=title: returns 200 zh-fallback for a published page with no cache row', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'title-zh', title: '原始中文标题', content: '# H', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=title&lang=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string; coverage: { hit: number; total: number } };
    expect(body.value).toBe('原始中文标题');
    expect(body.coverage).toEqual({ hit: 0, total: 1 });
  });

  it('field=title: returns the en text after a POST /cache primes hashBlock(title)', async () => {
    const title = '一段含 `code` 与 *italic* 的标题';
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'title-hit', title, content: 'body', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const { hashBlock } = await import('../services/i18n.service.js');
    const hash = hashBlock(title);
    const cache = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.both),
      body: JSON.stringify({ entries: [{ sourceHash: hash, lang: 'en', text: '[en] title', model: 'claude-test', humanEdited: false }] }),
    });
    expect(cache.status).toBe(200);
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=title&lang=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string; coverage: { hit: number; total: number } };
    expect(body.value).toBe('[en] title');
    expect(body.coverage).toEqual({ hit: 1, total: 1 });
  });

  it('field=title: works for posts too', async () => {
    const [post] = await db.insert(posts).values({
      id: nanoid(), slug: 'post-title', title: 'Post 标题', content: 'body', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const res = await app.request(`/api/i18n/render?type=post&id=${post.id}&field=title&lang=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string; coverage: { hit: number; total: number } };
    expect(body.value).toBe('Post 标题');
    expect(body.coverage).toEqual({ hit: 0, total: 1 });
  });

  it('field=title: app is NOT supported (apps have no title field; returns 404)', async () => {
    const res = await app.request('/api/i18n/render?type=app&id=anything&field=title&lang=en');
    expect(res.status).toBe(404);
  });

  it('field=title: draft page returns 404 (no leak)', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'title-draft', title: 'D', content: 'body', status: 'draft',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const res = await app.request(`/api/i18n/render?type=page&id=${page.id}&field=title&lang=en`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// REST: scope gating on /cache and /pending
// ---------------------------------------------------------------------------

describe('REST scope enforcement', () => {
  it('POST /api/i18n/cache: 401 without a key', async () => {
    const res = await app.request('/api/i18n/cache', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/i18n/cache: 403 with a wrong-domain key (posts:write)', async () => {
    const res = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.posts), body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/i18n/cache: 403 with i18n:read only (no i18n:write)', async () => {
    const res = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.ro), body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/i18n/cache: 200 with i18n:write', async () => {
    const res = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.wo), body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/i18n/pending: 401 without a key', async () => {
    const res = await app.request('/api/i18n/pending?lang=en');
    expect(res.status).toBe(401);
  });

  it('GET /api/i18n/pending: 403 with i18n:write only', async () => {
    const res = await app.request('/api/i18n/pending?lang=en', { headers: bearer(KEYS.wo) });
    expect(res.status).toBe(403);
  });

  it('GET /api/i18n/pending: 200 with i18n:read', async () => {
    const res = await app.request('/api/i18n/pending?lang=en', { headers: bearer(KEYS.ro) });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// REST: pending listing behavior
// ---------------------------------------------------------------------------

describe('GET /api/i18n/pending (service behavior)', () => {
  it('lists a published page\'s blocks when no cache row exists, and shrinks after a cache prime', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'pending', title: 'P', content: '# A\n\nB', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const { splitBlocks } = await import('../services/i18n.service.js');
    const blocks = splitBlocks(page.content);

    // 1) nothing cached → all blocks pending
    const before = await app.request('/api/i18n/pending?lang=en', { headers: bearer(KEYS.ro) });
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as { hash: string; ref: string }[];
    const beforeHashes = new Set(beforeBody.filter(u => u.ref === `page:${page.id}:content`).map(u => u.hash));
    for (const b of blocks) expect(beforeHashes.has(b.hash)).toBe(true);

    // 2) prime cache with one block
    const prime = await app.request('/api/i18n/cache', {
      method: 'POST', headers: bearer(KEYS.wo),
      body: JSON.stringify({
        entries: [{ sourceHash: blocks[0].hash, lang: 'en', text: '[en] A', model: 'claude-test', humanEdited: false }],
      }),
    });
    expect(prime.status).toBe(200);

    // 3) pending should now exclude that block
    const after = await app.request('/api/i18n/pending?lang=en', { headers: bearer(KEYS.ro) });
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as { hash: string; ref: string }[];
    const afterHashes = new Set(afterBody.filter(u => u.ref === `page:${page.id}:content`).map(u => u.hash));
    expect(afterHashes.has(blocks[0].hash)).toBe(false);
  });

  it('lists a published page\'s title unit (post:id:title ref) when no cache row exists', async () => {
    const title = 'Pending 标题';
    const [post] = await db.insert(posts).values({
      id: nanoid(), slug: 'pending-title', title, content: 'body', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const { hashBlock } = await import('../services/i18n.service.js');
    const expectedHash = hashBlock(title);

    const res = await app.request('/api/i18n/pending?lang=en', { headers: bearer(KEYS.ro) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hash: string; ref: string }[];
    const titleUnits = body.filter(u => u.ref === `post:${post.id}:title`);
    expect(titleUnits.length).toBe(1);
    expect(titleUnits[0].hash).toBe(expectedHash);
  });
});

// ---------------------------------------------------------------------------
// MCP: i18n tools (via /api/mcp)
// ---------------------------------------------------------------------------

describe('MCP i18n tools (via /api/mcp)', () => {
  it('i18n_put_cache round-trip: write a translation, i18n_render returns the translated text', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'mcp-rt', title: 'P', content: '# 标题', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const { splitBlocks } = await import('../services/i18n.service.js');
    const [block] = splitBlocks(page.content);

    const sid = await openMcpSession(KEYS.both);

    // 1) write a translation
    const write = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'i18n_put_cache',
          arguments: {
            entries: JSON.stringify([
              { sourceHash: block.hash, lang: 'en', text: '[en] heading', model: 'claude-test', humanEdited: false },
            ]),
          },
        },
      }),
    });
    expect(write.status).toBe(200);
    const wjson = (await write.json()) as { result?: { isError?: boolean } };
    expect(wjson.result?.isError).toBeFalsy();

    // 2) render — should hit the cache
    const render = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'i18n_render', arguments: { type: 'page', id: page.id, field: 'content', lang: 'en' } },
      }),
    });
    expect(render.status).toBe(200);
    const rjson = (await render.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(rjson.result?.isError).toBeFalsy();
    const text = rjson.result?.content?.[0]?.text ?? '';
    expect(text).toContain('[en] heading');
    expect(text).toContain('"hit": 1');
  });

  it('i18n_render field=title round-trip: write a translation, i18n_render returns the translated text', async () => {
    const title = 'MCP 标题';
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'mcp-title-rt', title, content: 'body', status: 'published',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const { hashBlock } = await import('../services/i18n.service.js');
    const hash = hashBlock(title);

    const sid = await openMcpSession(KEYS.both);

    // 1) write a translation
    const write = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 10, method: 'tools/call',
        params: {
          name: 'i18n_put_cache',
          arguments: {
            entries: JSON.stringify([
              { sourceHash: hash, lang: 'en', text: '[en] mcp title', model: 'claude-test', humanEdited: false },
            ]),
          },
        },
      }),
    });
    expect(write.status).toBe(200);
    const wjson = (await write.json()) as { result?: { isError?: boolean } };
    expect(wjson.result?.isError).toBeFalsy();

    // 2) render — should hit the cache for field=title
    const render = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 11, method: 'tools/call',
        params: { name: 'i18n_render', arguments: { type: 'page', id: page.id, field: 'title', lang: 'en' } },
      }),
    });
    expect(render.status).toBe(200);
    const rjson = (await render.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(rjson.result?.isError).toBeFalsy();
    const text = rjson.result?.content?.[0]?.text ?? '';
    expect(text).toContain('[en] mcp title');
    expect(text).toContain('"hit": 1');
  });

  it('i18n_render field=title on a draft returns isError (not a leak)', async () => {
    const [page] = await db.insert(pages).values({
      id: nanoid(), slug: 'mcp-draft', title: 'D', content: '# 草稿', status: 'draft',
      createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    const sid = await openMcpSession(KEYS.both);
    const res = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 4, method: 'tools/call',
        params: { name: 'i18n_render', arguments: { type: 'page', id: page.id, field: 'content', lang: 'en' } },
      }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { result?: { isError?: boolean } };
    expect(j.result?.isError).toBe(true);
  });

  it('i18n_put_cache with malformed JSON entries returns isError', async () => {
    const sid = await openMcpSession(KEYS.both);
    const res = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 5, method: 'tools/call',
        params: { name: 'i18n_put_cache', arguments: { entries: '{not valid json' } },
      }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(j.result?.isError).toBe(true);
    expect(j.result?.content?.[0]?.text).toMatch(/JSON|valid/);
  });

  it('i18n_put_cache without entries param returns isError (toZodShape makes it optional)', async () => {
    const sid = await openMcpSession(KEYS.both);
    const res = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.both, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 6, method: 'tools/call',
        params: { name: 'i18n_put_cache', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { result?: { isError?: boolean } };
    expect(j.result?.isError).toBe(true);
  });

  it('scope: i18n_put_cache denied to an i18n:read-only key', async () => {
    const sid = await openMcpSession(KEYS.ro);
    const res = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.ro, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 7, method: 'tools/call',
        params: { name: 'i18n_put_cache', arguments: { entries: '[]' } },
      }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(j.result?.isError).toBe(true);
    expect(j.result?.content?.[0]?.text).toContain('i18n:write');
  });

  it('scope: i18n_pending denied to an i18n:write-only key', async () => {
    const sid = await openMcpSession(KEYS.wo);
    const res = await app.request('/api/mcp', {
      method: 'POST', headers: mcpHeaders(KEYS.wo, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 8, method: 'tools/call',
        params: { name: 'i18n_pending', arguments: { lang: 'en' } },
      }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(j.result?.isError).toBe(true);
    expect(j.result?.content?.[0]?.text).toContain('i18n:read');
  });
});
