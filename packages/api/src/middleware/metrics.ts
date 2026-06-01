import type { MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requestMetrics } from '../db/schema.js';

const RETENTION_DAYS = 30;

// Skip noise that would either dominate or feed back on itself:
//  - the panel's own polling (/api/observability/*) — recording it would inflate
//    the very numbers the panel shows
//  - health/info pings and CORS preflights
//  - static uploads (served by Caddy in prod anyway)
//  - unmatched routes (no stable pattern → cardinality risk)
function isExcluded(route: string, method: string): boolean {
  if (method === 'OPTIONS') return true;
  if (!route) return true;
  if (route === '/' || route === '/health') return true;
  if (route.startsWith('/api/observability')) return true;
  if (route.startsWith('/uploads')) return true;
  return false;
}

// Top-level timing middleware. Reads c.req.routePath AFTER next() resolves, when
// the matched route pattern is known (verified: gives /api/posts/:id, not the raw
// path). Recording is wrapped so metrics can never break a request.
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();

  try {
    const route = c.req.routePath;
    if (isExcluded(route, c.req.method)) return;

    const durationMs = Number((performance.now() - start).toFixed(2));
    const now = Math.floor(Date.now() / 1000);

    db.insert(requestMetrics).values({
      method: c.req.method,
      route,
      status: c.res.status,
      durationMs,
      createdAt: now,
    }).run();

    // Probabilistic retention: ~0.5% of writes prune rows past the window, so the
    // table self-maintains without a cron and without a delete on every request.
    if (Math.random() < 0.005) {
      db.delete(requestMetrics).where(sql`${requestMetrics.createdAt} < ${now - RETENTION_DAYS * 86400}`).run();
    }
  } catch {
    // swallow — observability must not affect the response
  }
};
