import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { sessions, evictSessions, SESSION_TTL_MS, SESSION_MAX } from '../mcp/http.js';
import { TOOL_SCOPES } from '../mcp/tools.js';

const { app } = await import('../app.js');

// Distinct 8-char prefixes (validateBearerToken looks up by token.slice(0,8)).
const KEYS = {
  full: 'mcpfull-aaaaaaaa', // ["*"]
  apps: 'mcpapps-bbbbbbbb', // ["apps:read","apps:write"]
  pod: 'mcppods-cccccccc', // ["podcasts:read","podcasts:write"] — no observability:read
  full2: 'mcpfulb-dddddddd', // ["*"] — a second, distinct full key (session-binding test)
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

const ACCEPT = 'application/json, text/event-stream';

function headers(raw?: string, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', accept: ACCEPT };
  if (raw) h['authorization'] = `Bearer ${raw}`;
  if (sessionId) h['mcp-session-id'] = sessionId;
  return h;
}

const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
});

// Open a session and return its Mcp-Session-Id.
async function openSession(raw: string): Promise<string> {
  const res = await app.request('/api/mcp', { method: 'POST', headers: headers(raw), body: INIT_BODY });
  expect(res.status).toBe(200);
  const sid = res.headers.get('mcp-session-id');
  expect(sid).toBeTruthy();
  return sid!;
}

// tools/list names visible to a given key's already-open session — the tool
// set is now scope-filtered at registration time, so this is the surface
// that "does a narrow key see fewer tools" assertions read from.
async function listToolNames(raw: string, sid: string): Promise<string[]> {
  const res = await app.request('/api/mcp', {
    method: 'POST',
    headers: headers(raw, sid),
    body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }),
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { result?: { tools?: { name: string }[] } };
  return (json.result?.tools ?? []).map((t) => t.name);
}

beforeAll(async () => {
  await seedKey(KEYS.full, 'mcp-full', '["*"]');
  await seedKey(KEYS.apps, 'mcp-apps', '["apps:read","apps:write"]');
  await seedKey(KEYS.pod, 'mcp-pod', '["podcasts:read","podcasts:write"]');
  await seedKey(KEYS.full2, 'mcp-full-2', '["*"]');
});

describe('MCP-over-HTTP route (/api/mcp)', () => {
  it('rejects a request with no API key (401)', async () => {
    const res = await app.request('/api/mcp', { method: 'POST', headers: headers(), body: INIT_BODY });
    expect(res.status).toBe(401);
  });

  it('rejects a non-initialize POST without a session (400)', async () => {
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.full),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(400);
  });

  it('initializes a session and reports the server identity', async () => {
    const res = await app.request('/api/mcp', { method: 'POST', headers: headers(KEYS.full), body: INIT_BODY });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
    const json = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(json.result?.serverInfo?.name).toBe('wordbase-blog');
  });

  it('lists exactly the TOOL_SCOPES-registered tools on the established session', async () => {
    const sid = await openSession(KEYS.full);
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.full, sid),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { tools?: unknown[] } };
    expect(json.result?.tools?.length).toBe(Object.keys(TOOL_SCOPES).length);
  });

  // Task 3: scope enforcement moved from "registered but isError at call time"
  // to "not registered at all" — a narrow key's tools/list is a strictly
  // smaller set, not a full set with landmines in it. Both polarities are
  // asserted (contains its own domain, excludes the other) plus a '*' control
  // so a regression that silently drops post_list itself would also fail.
  it('scope-gates tool registration: an apps-only key sees its own domain but not posts', async () => {
    const sid = await openSession(KEYS.apps);
    const names = await listToolNames(KEYS.apps, sid);
    expect(names).toContain('app_list');
    expect(names).not.toContain('post_list');

    const sidFull = await openSession(KEYS.full);
    const fullNames = await listToolNames(KEYS.full, sidFull);
    expect(fullNames).toContain('app_list');
    expect(fullNames).toContain('post_list');
  });

  // podcast_analytics serves the same data as the REST /api/observability/podcast/*
  // routes (observability:read). A podcasts-scoped key must NOT reach it via MCP —
  // otherwise it's a scope-mismatch escalation (MCP grants what REST denies). With
  // Task 3's registration-time gate, "denied" now means the tool never appears in
  // tools/list.
  it('scope-gates tool registration: a podcasts-only key sees podcast_list_shows but not podcast_analytics (needs observability:read)', async () => {
    const sid = await openSession(KEYS.pod);
    const names = await listToolNames(KEYS.pod, sid);
    expect(names).toContain('podcast_list_shows');
    expect(names).not.toContain('podcast_analytics');

    const sidFull = await openSession(KEYS.full);
    const fullNames = await listToolNames(KEYS.full, sidFull);
    expect(fullNames).toContain('podcast_list_shows');
    expect(fullNames).toContain('podcast_analytics');
  });

  // A session id is only as safe as the header carrying it. If it leaks (logs,
  // proxies, a shared terminal), a different — even if otherwise valid — key
  // must not be able to ride the creator's permissions on it.
  it('rejects a different API key reusing another key\'s session id (401)', async () => {
    const sid = await openSession(KEYS.full);
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.full2, sid),
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: { code?: number } };
    expect(json.error?.code).toBe(-32001);
  });

  it('allows the same API key to reuse its own session (200)', async () => {
    const sid = await openSession(KEYS.full);
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.full, sid),
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('MCP-over-HTTP session eviction', () => {
  it('reaps sessions past the TTL and keeps the fresh one', () => {
    sessions.clear();
    sessions.set('stale-session', {
      transport: { close: () => {} } as any,
      server: {} as any,
      keyId: 'k1',
      lastSeen: Date.now() - SESSION_TTL_MS - 1_000,
    });
    sessions.set('fresh-session', {
      transport: { close: () => {} } as any,
      server: {} as any,
      keyId: 'k2',
      lastSeen: Date.now(),
    });

    evictSessions();

    expect(sessions.size).toBe(1);
    expect(sessions.has('fresh-session')).toBe(true);
    expect(sessions.has('stale-session')).toBe(false);
  });

  it('evicts the oldest sessions once at the cap', () => {
    sessions.clear();
    const now = Date.now();
    for (let i = 0; i < SESSION_MAX; i++) {
      sessions.set(`session-${i}`, {
        transport: { close: () => {} } as any,
        server: {} as any,
        keyId: `k${i}`,
        // Ascending lastSeen: session-0 is the oldest.
        lastSeen: now - (SESSION_MAX - i) * 1_000,
      });
    }
    expect(sessions.size).toBe(SESSION_MAX);

    evictSessions(now);

    expect(sessions.size).toBe(SESSION_MAX - 1);
    expect(sessions.has('session-0')).toBe(false);
    expect(sessions.has(`session-${SESSION_MAX - 1}`)).toBe(true);
  });
});
