import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { validateBearerToken } from '../middleware/auth.js';
import { registerTools } from './tools.js';
import type { AppEnv } from '../types.js';

// MCP-over-HTTP for the WordBase tools, mounted into the existing Hono API
// process (shares the single SQLite connection — no second writer). The stdio
// entry point (server.ts) is unchanged; this is the remote transport reached
// through Caddy at https://norvyn.com/api/mcp.
//
// Stateful Streamable HTTP: the client POSTs `initialize`, gets an
// `mcp-session-id`, and reuses it on every follow-up request. Each session owns
// one transport + one McpServer scoped to the calling key's permissions. JSON
// responses are enabled (tools are request/response; no server-push streaming).

// Report whatever version the release pipeline last stamped — resolves to
// packages/api/package.json from both src/mcp/ (tsx) and dist/mcp/ (built).
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
const { version: pkgVersion } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  // The keyId of the API key that created this session. Every follow-up
  // request on this session must come from the SAME key — otherwise a leaked
  // Mcp-Session-Id lets any other valid key ride the creator's permissions.
  keyId: string;
  // Last time (ms epoch) this session handled a request. Drives TTL eviction
  // so abandoned sessions (client never sends DELETE, connection just drops)
  // don't grow the map without bound.
  lastSeen: number;
}

// Active sessions keyed by the generated Mcp-Session-Id. Entries are added when
// a session initializes and removed when its transport closes (DELETE / client
// disconnect) or when evictSessions() reaps them (TTL / max-size).
// Exported for tests only (constructing eviction scenarios directly).
export const sessions = new Map<string, Session>();

// Exported for tests only — production code should go through evictSessions().
export const SESSION_TTL_MS = 30 * 60_000;
export const SESSION_MAX = 200;

// Reap sessions that have been idle past the TTL, then — if we're still at or
// over the cap — keep evicting the oldest (by lastSeen) until under it. Takes
// a snapshot of the map up front: transport.close() synchronously triggers
// onclose below, which deletes from `sessions`; mutating/reading the live map
// while iterating it would observe stale state mid-loop.
export function evictSessions(now: number = Date.now()): void {
  const entries = [...sessions.entries()];
  for (const [id, session] of entries) {
    if (now - session.lastSeen > SESSION_TTL_MS) {
      session.transport.close();
      sessions.delete(id); // idempotent — onclose already does this
    }
  }
  if (sessions.size >= SESSION_MAX) {
    const byLastSeen = [...sessions.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [id, session] of byLastSeen) {
      if (sessions.size < SESSION_MAX) break;
      session.transport.close();
      sessions.delete(id);
    }
  }
}

function jsonRpcError(code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status: code === -32001 ? 401 : 400,
    headers: { 'content-type': 'application/json' },
  });
}

export async function mcpHttpHandler(c: Context<AppEnv>): Promise<Response> {
  // Bearer auth on every request (initialize and follow-ups). The key's scopes
  // gate the tools via registerTools below.
  const auth = await validateBearerToken(c.req.header('Authorization'));
  if (!auth) {
    return jsonRpcError(-32001, 'Unauthorized: missing or invalid API key');
  }

  const sessionId = c.req.header('mcp-session-id');

  // Only POST carries a JSON-RPC body. Read it once here so the transport can
  // reuse it via parsedBody (Hono already consumed the request stream).
  let body: unknown;
  if (c.req.method === 'POST') {
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
  }

  let session: Session | undefined;
  if (sessionId && sessions.has(sessionId)) {
    // Existing session — but only for the key that created it. A leaked
    // Mcp-Session-Id must not let a different (even if valid) key ride the
    // creator's permissions.
    const existing = sessions.get(sessionId)!;
    if (existing.keyId !== auth.keyId) {
      return jsonRpcError(-32001, 'Unauthorized: session belongs to a different API key');
    }
    existing.lastSeen = Date.now();
    session = existing;
  } else if (c.req.method === 'POST' && !sessionId && isInitializeRequest(body)) {
    // Reap idle/excess sessions before growing the map with a new one.
    evictSessions();

    // New session: build a transport + a server scoped to THIS key's permissions.
    const server = new McpServer({ name: 'wordbase-blog', version: pkgVersion });
    registerTools(server, auth.permissions);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      enableDnsRebindingProtection: false, // Caddy is the trust boundary; tighten later
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, keyId: auth.keyId, lastSeen: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    session = { transport, server, keyId: auth.keyId, lastSeen: Date.now() };
  } else {
    // Missing/invalid session on a non-initialize request.
    return jsonRpcError(-32000, 'Bad Request: no valid session ID provided');
  }

  // parsedBody avoids re-reading the already-consumed request stream; headers
  // and method are still read from the raw Request.
  return session!.transport.handleRequest(
    c.req.raw,
    body !== undefined ? { parsedBody: body } : undefined
  );
}
