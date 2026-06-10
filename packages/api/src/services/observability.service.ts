import { gte, sql, eq, desc } from 'drizzle-orm';
import { statSync } from 'fs';
import { db, dbPragmas, DB_FILE } from '../db/index.js';
import { requestMetrics, posts, comments, pageViews, media, apps, podcasts, podcastEpisodes } from '../db/schema.js';
import { getBuildStatus } from './build.service.js';
import { cached, cachedSync } from '../lib/ttl-cache.js';

// Short staleness budget for the Observability dashboard (see analytics.service.ts).
const OBS_CACHE_TTL_MS = 60_000;

// Nearest-rank percentile over an ascending-sorted array.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export interface EndpointStat {
  method: string;
  route: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  errorRate: number; // percent of requests with status >= 400
}

// SQLite has no percentile function, so we pull the (already bounded) rows in the
// window and aggregate per endpoint in JS. At personal-site volume this is a few
// thousand rows at most; the created_at index keeps the scan cheap.
export async function getRequestMetrics(hours: number = 24) {
  return cached(`requestMetrics:${hours}`, OBS_CACHE_TTL_MS, async () => {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const rows = await db.select({
    method: requestMetrics.method,
    route: requestMetrics.route,
    status: requestMetrics.status,
    durationMs: requestMetrics.durationMs,
  }).from(requestMetrics).where(gte(requestMetrics.createdAt, since));

  const groups = new Map<string, { method: string; route: string; durations: number[]; errors: number }>();
  const statusClass: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  let total = 0;
  let errors = 0;

  for (const r of rows) {
    const key = `${r.method} ${r.route}`;
    let g = groups.get(key);
    if (!g) { g = { method: r.method, route: r.route, durations: [], errors: 0 }; groups.set(key, g); }
    g.durations.push(r.durationMs);
    total++;

    const cls = `${Math.floor(r.status / 100)}xx`;
    if (statusClass[cls] !== undefined) statusClass[cls]++;
    if (r.status >= 400) { g.errors++; errors++; }
  }

  const endpoints: EndpointStat[] = [...groups.values()].map((g) => {
    const sorted = g.durations.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      method: g.method,
      route: g.route,
      count: sorted.length,
      avgMs: Number((sum / sorted.length).toFixed(1)),
      p50Ms: Number(percentile(sorted, 50).toFixed(1)),
      p95Ms: Number(percentile(sorted, 95).toFixed(1)),
      errorRate: Number(((g.errors / sorted.length) * 100).toFixed(1)),
    };
  }).sort((a, b) => b.count - a.count);

  return {
    hours,
    totalRequests: total,
    errorRate: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
    statusClass,
    endpoints,
  };
  });
}

/* ---------------- system health + ops status (Stage C, read-only) ---------------- */

function fileSize(path: string): number {
  try { return statSync(path).size; } catch { return 0; }
}

function count(table: any): number {
  const [r] = db.select({ c: sql<number>`count(*)` }).from(table).all() as { c: number }[];
  return r?.c ?? 0;
}

function countWhere(table: any, where: any): number {
  const [r] = db.select({ c: sql<number>`count(*)` }).from(table).where(where).all() as { c: number }[];
  return r?.c ?? 0;
}

export function getSystemStatus() {
  return cachedSync('systemStatus', OBS_CACHE_TTL_MS, () => {
  // --- runtime ---
  const mem = process.memoryUsage();

  // --- database ---
  const { pageCount, pageSize, journalMode } = dbPragmas();
  const mainBytes = fileSize(DB_FILE);
  const walBytes = fileSize(`${DB_FILE}-wal`);

  const tableRows = {
    posts: count(posts),
    comments: count(comments),
    pageViews: count(pageViews),
    requestMetrics: count(requestMetrics),
    media: count(media),
  };

  // --- ops: content publish + sync status (read-only) ---
  const build = getBuildStatus();

  const appRows = db.select({
    name: apps.name, status: apps.status, lastSyncedAt: apps.lastSyncedAt,
  }).from(apps).orderBy(desc(apps.lastSyncedAt)).all();
  const appStatus = {
    total: appRows.length,
    published: appRows.filter((a) => a.status === 'published').length,
    draft: appRows.filter((a) => a.status === 'draft').length,
    lastSyncedAt: appRows.reduce<number | null>((m, a) => (a.lastSyncedAt && (!m || a.lastSyncedAt > m) ? a.lastSyncedAt : m), null),
    recent: appRows.slice(0, 5).map((a) => ({ name: a.name, status: a.status, lastSyncedAt: a.lastSyncedAt })),
  };

  const [lastEp] = db.select({ publishedAt: podcastEpisodes.publishedAt })
    .from(podcastEpisodes).where(eq(podcastEpisodes.status, 'published'))
    .orderBy(desc(podcastEpisodes.publishedAt)).limit(1).all();
  const podcastStatus = {
    shows: count(podcasts),
    showsPublished: countWhere(podcasts, eq(podcasts.status, 'published')),
    episodes: count(podcastEpisodes),
    episodesPublished: countWhere(podcastEpisodes, eq(podcastEpisodes.status, 'published')),
    lastPublishedAt: lastEp?.publishedAt ?? null,
  };

  const pendingComments = countWhere(comments, eq(comments.status, 'pending'));

  return {
    runtime: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    },
    database: {
      sizeBytes: mainBytes,
      walBytes,
      pageCount,
      pageSize,
      journalMode,
      tableRows,
    },
    ops: {
      build,
      apps: appStatus,
      podcast: podcastStatus,
      pendingComments,
    },
  };
  });
}
