import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';

const { app } = await import('../app.js');

// Distinct 8-char prefixes (validateBearerToken looks up by token.slice(0,8)).
const KEYS = {
  full: 'mcpfull-aaaaaaaa', // ["*"]
  apps: 'mcpapps-bbbbbbbb', // ["apps:read","apps:write"]
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

beforeAll(async () => {
  await seedKey(KEYS.full, 'mcp-full', '["*"]');
  await seedKey(KEYS.apps, 'mcp-apps', '["apps:read","apps:write"]');
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

  it('lists all 42 tools on the established session', async () => {
    const sid = await openSession(KEYS.full);
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.full, sid),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { tools?: unknown[] } };
    expect(json.result?.tools?.length).toBe(42);
  });

  it('scope-gates tool execution: an apps-only key is denied a posts tool', async () => {
    const sid = await openSession(KEYS.apps);
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: headers(KEYS.apps, sid),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'blog_list_posts', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('posts:read');
  });
});
