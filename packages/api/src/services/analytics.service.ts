import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pageViews, posts, postTags, tags, shareEvents } from '../db/schema.js';
import { hashIp } from '../lib/hash-ip.js';
import { lookupCountry } from '../lib/geoip.js';
import { cached } from '../lib/ttl-cache.js';

// Short staleness budget for the Observability dashboard read aggregations: repeat
// panel opens and period toggles within this window are served from memory instead
// of re-scanning the raw event tables. Transparent — cached values equal the live result.
const OBS_CACHE_TTL_MS = 60_000;

// Bot user-agent classification (read-side only; the single shared definition).
// FALSE for null UA, so unknown-UA hits stay counted (matching getDeviceBreakdown's
// null→'unknown', not 'bot', branch). Consumed by the PV aggregations (getTopPosts /
// getTotalPageViews / getTodayPageViews / getTrends / getRegions / getTopPages, which
// exclude bots so the headline numbers mean real readers) AND by getVisitorSummary /
// getVisitTrends / getDeviceBreakdown. NOTE: getVisitorSummary/getVisitTrends keep
// RAW pageViews (bots counted) intentionally — only their UV/sessions use this.
// Hoisted here so the earlier-defined aggregations can reference it.
const isBotSql = sql`(${pageViews.userAgent} is not null and (
  lower(${pageViews.userAgent}) like '%bot%'
  or lower(${pageViews.userAgent}) like '%spider%'
  or lower(${pageViews.userAgent}) like '%crawl%'
  or lower(${pageViews.userAgent}) like '%facebookexternalhit%'
  or lower(${pageViews.userAgent}) like '%curl/%'
  or lower(${pageViews.userAgent}) like '%wget%'
  or lower(${pageViews.userAgent}) like '%python-requests%'
  or lower(${pageViews.userAgent}) like '%go-http-client%'
  or lower(${pageViews.userAgent}) like '%node-fetch%'
  or lower(${pageViews.userAgent}) like '%headlesschrome%'
  or lower(${pageViews.userAgent}) like '%slurp%'))`;

// Share-button channels we accept; anything else is rejected so the by-target
// breakdown stays clean (path carries page/episode context, not target).
export const SHARE_TARGETS = ['x', 'wechat', 'copy', 'native'] as const;
export type ShareTarget = (typeof SHARE_TARGETS)[number];

export interface RecordPageViewInput {
  path: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  visitorId?: string | null;
}

function getTodayStart(): number {
  const now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
}

export async function recordPageView(input: RecordPageViewInput) {
  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(pageViews).values({
    path: input.path,
    referrer: input.referrer ?? null,
    userAgent: input.userAgent ?? null,
    ipHash: input.ipAddress ? hashIp(input.ipAddress) : null,
    country: lookupCountry(input.ipAddress), // null if no GeoIP DB; raw IP never stored
    visitorId: input.visitorId ?? null,
    createdAt: now,
  }).returning();
  return record;
}

export async function getTotalPageViews() {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews)
    .where(sql`not (${isBotSql})`);
  return result.count;
}

export interface RecordShareInput {
  path: string;
  target: string;
  ipAddress?: string;
}

// Records one share-button click. Click-time, no dedup (raw event stream) —
// share-completion callbacks are unreliable, so the click is the signal.
// Invalid targets are rejected (returns null) to keep the channel column clean.
export async function recordShare(input: RecordShareInput) {
  if (!SHARE_TARGETS.includes(input.target as ShareTarget)) return null;
  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(shareEvents).values({
    path: input.path,
    target: input.target,
    ipHash: input.ipAddress ? hashIp(input.ipAddress) : null,
    createdAt: now,
  }).returning();
  return record;
}

// Read-time aggregation: shares grouped by channel and by page, within `days`.
export async function getShareStats(days: number = 30) {
  return cached(`shareStats:${days}`, OBS_CACHE_TTL_MS, async () => {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const where = gte(shareEvents.createdAt, since);

  const byTarget = await db.select({
    target: shareEvents.target,
    count: sql<number>`count(*)`,
  }).from(shareEvents).where(where)
    .groupBy(shareEvents.target)
    .orderBy(desc(sql`count(*)`));

  const byPageRaw = await db.select({
    path: shareEvents.path,
    count: sql<number>`count(*)`,
  }).from(shareEvents).where(where)
    .groupBy(shareEvents.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  const byPage = byPageRaw.map(r => ({ path: decodePath(r.path), count: r.count }));

  return { days, byTarget, byPage };
  });
}

// Visitor counts by country (ISO alpha-2) within `days`. Rows with no country
// (geo lookup unavailable at ingest, e.g. before the GeoIP DB was installed) are
// excluded — they can't be placed on the map.
export async function getRegions(days: number = 30) {
  return cached(`regions:${days}`, OBS_CACHE_TTL_MS, async () => {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await db.select({
    country: pageViews.country,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(and(gte(pageViews.createdAt, since), sql`${pageViews.country} is not null`, sql`not (${isBotSql})`))
    .groupBy(pageViews.country)
    .orderBy(desc(sql`count(*)`));

  return rows.map(r => ({ country: r.country as string, count: r.count }));
  });
}

export async function getTodayPageViews() {
  const todayStart = getTodayStart();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews)
    .where(and(gte(pageViews.createdAt, todayStart), sql`not (${isBotSql})`));
  return result.count;
}

export async function getActivePostCount() {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.status, 'published'));
  return result.count;
}

export async function getOverview() {
  const [totalPV, todayPV, activePosts] = await Promise.all([
    getTotalPageViews(),
    getTodayPageViews(),
    getActivePostCount(),
  ]);
  return { totalPageViews: totalPV, todayPageViews: todayPV, activePostCount: activePosts };
}

export async function getPostPageViews(postId: string) {
  // Get post slug to match path
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return null;

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews)
    .where(sql`${pageViews.path} LIKE ${'%/' + post.slug + '%'}`);

  return { postId, slug: post.slug, pageViews: result.count };
}

export async function getTopPosts(limit: number = 10) {
  // Count views per path (bots excluded), then aggregate BY POST: the same article
  // is reachable via several paths (zh /posts/<slug>, en /en/posts/<slug>, and
  // .html / query variants), so grouping by path alone double-counts a post. Fetch
  // all post-matching paths (cardinality is bounded by distinct paths, not rows) and
  // sum each post's variants before ranking.
  const results = await db.select({
    path: pageViews.path,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(sql`not (${isBotSql})`)
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`));

  const allPosts = await db.select().from(posts).where(eq(posts.status, 'published'));
  const postsBySlug = new Map(allPosts.map(p => [p.slug, p]));

  const byPost = new Map<string, { postId: string; title: string; slug: string; views: number }>();
  for (const row of results) {
    // Decode percent-encoded (CJK) slugs, drop a trailing .html and any ?query,
    // then take the last segment as the slug. Anchor on the `posts` parent
    // segment (zh /posts/<slug>, en /en/posts/<slug>) so a non-post page like
    // /tags/<x> is never mis-resolved to a post that happens to be slugged <x>.
    const clean = decodePath(row.path).split('?')[0].replace(/\.html$/i, '');
    const segments = clean.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];
    const isPostRoute = segments[segments.length - 2] === 'posts';
    const post = (slug && isPostRoute) ? postsBySlug.get(slug) : undefined;
    if (!post) continue;
    const entry = byPost.get(post.id) ?? { postId: post.id, title: post.title, slug: post.slug, views: 0 };
    entry.views += row.count;
    byPost.set(post.id, entry);
  }

  return [...byPost.values()].sort((a, b) => b.views - a.views).slice(0, limit);
}

// Friendly labels for known static (non-post) pages so the Top pages widget
// shows "About" instead of a bare "/about". Anything not listed and not a post
// falls back to its raw path.
const STATIC_PAGE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/apps': 'Apps',
  '/podcast': 'Podcast',
  '/writing': 'Writing',
  '/archives': 'Archives',
};

// Page-view and share paths are stored exactly as the browser reported them
// (location.pathname / URL.pathname), so non-ASCII slugs arrive percent-encoded
// (e.g. /posts/%E4%BB%80...). Decode for slug matching + display; fall back to the
// raw string if it isn't valid percent-encoding (a stray '%' would otherwise throw).
function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

// Unlike getTopPosts (which the blog_analytics_top_posts MCP tool consumes and
// must stay post-only), this ranks ALL visited pages for the admin Observability
// widget: posts resolve to their title, known static pages get a friendly label,
// everything else shows its raw path. Admin/api paths are excluded defensively
// (admin uses AdminLayout, which sends no pageview beacon, so they shouldn't be
// in page_views anyway).
export async function getTopPages(limit: number = 10) {
  return cached(`topPages:${limit}`, OBS_CACHE_TTL_MS, async () => {
  const results = await db.select({
    path: pageViews.path,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(and(
      sql`${pageViews.path} NOT LIKE '/admin/%'`,
      sql`${pageViews.path} NOT LIKE '/api/%'`,
      sql`not (${isBotSql})`,
    ))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`));

  const allPosts = await db.select().from(posts).where(eq(posts.status, 'published'));
  const postsBySlug = new Map(allPosts.map(p => [p.slug, p]));

  // Posts: aggregate variant paths by post id (sum views, keep the dominant
  // variant as the display path). Non-post paths: one row each, as before.
  const byPost = new Map<string, { path: string; label: string; views: number; top: number }>();
  const others: { path: string; label: string; views: number }[] = [];

  for (const row of results) {
    const path = decodePath(row.path);
    const slugSrc = path.split('?')[0].replace(/\.html$/i, '');
    const segments = slugSrc.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];
    // Anchor on the `posts` parent segment so /tags/<x>, /categories/<x>, etc.
    // are never folded into a post slugged <x> (they stay their own rows).
    const isPostRoute = segments[segments.length - 2] === 'posts';
    const post = (slug && isPostRoute) ? postsBySlug.get(slug) : undefined;
    if (post) {
      const entry = byPost.get(post.id) ?? { path, label: post.title, views: 0, top: 0 };
      entry.views += row.count;
      if (row.count > entry.top) { entry.top = row.count; entry.path = path; }
      byPost.set(post.id, entry);
    } else {
      others.push({ path, label: STATIC_PAGE_LABELS[path] ?? path, views: row.count });
    }
  }

  return [
    ...[...byPost.values()].map(({ path, label, views }) => ({ path, label, views })),
    ...others,
  ].sort((a, b) => b.views - a.views).slice(0, limit);
  });
}

export async function getTrends(period: string = 'daily') {
  let groupFormat: string;
  let groupCount: number;

  switch (period) {
    case 'weekly':
      groupFormat = '%Y-W%W';
      groupCount = 12;
      break;
    case 'monthly':
      groupFormat = '%Y-%m';
      groupCount = 12;
      break;
    default: // daily
      groupFormat = '%Y-%m-%d';
      groupCount = 30;
  }

  const results = await db.select({
    period: sql<string>`strftime('${sql.raw(groupFormat)}', datetime(${pageViews.createdAt}, 'unixepoch'))`,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(sql`not (${isBotSql})`)
    .groupBy(sql`strftime('${sql.raw(groupFormat)}', datetime(${pageViews.createdAt}, 'unixepoch'))`)
    .orderBy(desc(sql`strftime('${sql.raw(groupFormat)}', datetime(${pageViews.createdAt}, 'unixepoch'))`))
    .limit(groupCount);

  return results.reverse(); // Chronological order
}

// --- Observability panel: visit analytics (read-side dedup) ---
//
// Deduplication is computed at READ time, never at write — page_views keeps the
// raw row stream untouched, so we can report raw PV, unique visitors, and
// deduplicated "sessions" all from the same data without ever discarding a hit.
//
// The "elegant algorithm" is a deterministic time-bucketed visit fingerprint:
//   sessionKey = ip_hash | path | floor(created_at / SESSION_WINDOW)
// Counting DISTINCT sessionKeys collapses repeat hits from the same visitor to
// the same path within one window. No HyperLogLog: at this scale exact
// COUNT(DISTINCT) over an indexed integer column is microseconds and zero error.
const SESSION_WINDOW_SECONDS = 1800; // 30 min — a refresh/re-read inside this folds into one session

// Visitor identity: prefer the client-minted browser id (visitor_id); fall back to
// ip_hash for rows recorded before the visitor_id column existed (and for clients with
// localStorage disabled). The two id spaces are format-disjoint (UUID vs 16-hex), so
// COALESCE cannot mis-merge a visitor_id with an ip_hash. Declared before sessionKeySql,
// which composes it. (UV used to count distinct ip_hash directly, but behind the prod
// proxy every ip_hash is 127.0.0.1's hash → UV collapsed to 1; see
// docs/06-plans/2026-06-06-real-client-ip-proxy-protocol-deferred.md.)
const visitorKeySql = sql<string>`coalesce(${pageViews.visitorId}, ${pageViews.ipHash})`;

// (isBotSql is hoisted near the top of this module so the PV aggregations can use it.)

// SQL fragment for the per-row session fingerprint. The visitor key may be null
// (unknown IP and no visitor_id); SQLite skips null keys in COUNT(DISTINCT), which is the
// desired behaviour (an unidentifiable hit is not a countable session).
//
// The window divisor is inlined as an integer literal via sql.raw and the
// quotient is cast to INTEGER: a bound numeric parameter makes SQLite do REAL
// division (each second a distinct bucket → no dedup), so we force integer
// floor division to land hits in the same 30-min bucket.
const sessionKeySql = sql<string>`${visitorKeySql} || '|' || ${pageViews.path} || '|' || cast(${pageViews.createdAt} / ${sql.raw(String(SESSION_WINDOW_SECONDS))} as integer)`;

export async function getVisitorSummary(days: number = 30) {
  return cached(`visitorSummary:${days}`, OBS_CACHE_TTL_MS, async () => {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const [row] = await db.select({
    pageViews: sql<number>`count(*)`,
    uniqueVisitors: sql<number>`count(distinct case when not ${isBotSql} then ${visitorKeySql} end)`,
    sessions: sql<number>`count(distinct case when not ${isBotSql} then (${sessionKeySql}) end)`,
  }).from(pageViews).where(gte(pageViews.createdAt, since));

  return {
    days,
    pageViews: row.pageViews,
    uniqueVisitors: row.uniqueVisitors,
    sessions: row.sessions,
  };
  });
}

export async function getVisitTrends(period: string = 'daily') {
  return cached(`visitTrends:${period}`, OBS_CACHE_TTL_MS, async () => {
  let groupFormat: string;
  let groupCount: number;

  switch (period) {
    case 'weekly':
      groupFormat = '%Y-W%W';
      groupCount = 12;
      break;
    case 'monthly':
      groupFormat = '%Y-%m';
      groupCount = 12;
      break;
    default: // daily
      groupFormat = '%Y-%m-%d';
      groupCount = 30;
  }

  const bucket = sql<string>`strftime('${sql.raw(groupFormat)}', datetime(${pageViews.createdAt}, 'unixepoch'))`;

  const results = await db.select({
    period: bucket,
    pageViews: sql<number>`count(*)`,
    uniqueVisitors: sql<number>`count(distinct case when not ${isBotSql} then ${visitorKeySql} end)`,
    sessions: sql<number>`count(distinct case when not ${isBotSql} then (${sessionKeySql}) end)`,
  }).from(pageViews)
    .groupBy(bucket)
    .orderBy(desc(bucket))
    .limit(groupCount);

  return results.reverse(); // chronological order
  });
}

export async function getReferrers(limit: number = 10) {
  return cached(`referrers:${limit}`, OBS_CACHE_TTL_MS, async () => {
  // Group by raw referrer, then collapse to host in JS (clean display without
  // brittle SQL host-parsing). Empty/null referrers are direct traffic.
  const rows = await db.select({
    referrer: pageViews.referrer,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(and(sql`${pageViews.referrer} is not null`, sql`${pageViews.referrer} != ''`))
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`));

  const byHost = new Map<string, number>();
  for (const r of rows) {
    let host = r.referrer as string;
    try {
      host = new URL(host).host || host;
    } catch {
      // not a URL — keep raw value
    }
    byHost.set(host, (byHost.get(host) ?? 0) + r.count);
  }

  return [...byHost.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  });
}

export async function getDeviceBreakdown(days: number = 365) {
  return cached(`deviceBreakdown:${days}`, OBS_CACHE_TTL_MS, async () => {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const deviceType = sql<string>`case
    when ${pageViews.userAgent} is null then 'unknown'
    when ${isBotSql} then 'bot'
    when ${pageViews.userAgent} like '%Mobi%'
      or ${pageViews.userAgent} like '%Android%'
      or ${pageViews.userAgent} like '%iPhone%'
      or ${pageViews.userAgent} like '%iPad%' then 'mobile'
    else 'desktop' end`;

  const rows = await db.select({
    type: deviceType,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(gte(pageViews.createdAt, since))
    .groupBy(deviceType)
    .orderBy(desc(sql`count(*)`));

  return rows;
  });
}

export async function getContentStats() {
  // Publish frequency: posts per month
  const publishFrequency = await db.select({
    month: sql<string>`strftime('%Y-%m', datetime(${posts.createdAt}, 'unixepoch'))`,
    count: sql<number>`count(*)`,
  }).from(posts)
    .where(eq(posts.status, 'published'))
    .groupBy(sql`strftime('%Y-%m', datetime(${posts.createdAt}, 'unixepoch'))`)
    .orderBy(desc(sql`strftime('%Y-%m', datetime(${posts.createdAt}, 'unixepoch'))`))
    .limit(12);

  // Tag distribution
  const tagDistribution = await db.select({
    tagName: tags.name,
    count: sql<number>`count(*)`,
  }).from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  // Total counts
  const [totalPosts] = await db.select({ count: sql<number>`count(*)` }).from(posts);
  const [publishedPosts] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.status, 'published'));
  const [draftPosts] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.status, 'draft'));

  return {
    totalPosts: totalPosts.count,
    publishedPosts: publishedPosts.count,
    draftPosts: draftPosts.count,
    publishFrequency: publishFrequency.reverse(),
    tagDistribution,
  };
}
