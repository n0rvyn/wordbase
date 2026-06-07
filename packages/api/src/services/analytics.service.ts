import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pageViews, posts, postTags, tags, shareEvents } from '../db/schema.js';
import { hashIp } from '../lib/hash-ip.js';
import { lookupCountry } from '../lib/geoip.js';

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
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews);
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
}

// Visitor counts by country (ISO alpha-2) within `days`. Rows with no country
// (geo lookup unavailable at ingest, e.g. before the GeoIP DB was installed) are
// excluded — they can't be placed on the map.
export async function getRegions(days: number = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await db.select({
    country: pageViews.country,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(and(gte(pageViews.createdAt, since), sql`${pageViews.country} is not null`))
    .groupBy(pageViews.country)
    .orderBy(desc(sql`count(*)`));

  return rows.map(r => ({ country: r.country as string, count: r.count }));
}

export async function getTodayPageViews() {
  const todayStart = getTodayStart();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews).where(gte(pageViews.createdAt, todayStart));
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
  // Group page views by path, extract post slug, join with posts
  const results = await db.select({
    path: pageViews.path,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 2); // Get extra to filter non-post paths

  // Match paths to posts
  const allPosts = await db.select().from(posts).where(eq(posts.status, 'published'));
  const postsBySlug = new Map(allPosts.map(p => [p.slug, p]));

  const topPosts = [];
  for (const row of results) {
    // Extract slug from path like /posts/my-slug or /blog/my-slug
    const segments = row.path.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];
    const post = postsBySlug.get(slug);
    if (post) {
      topPosts.push({ postId: post.id, title: post.title, slug: post.slug, views: row.count });
      if (topPosts.length >= limit) break;
    }
  }

  return topPosts;
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
  const results = await db.select({
    path: pageViews.path,
    count: sql<number>`count(*)`,
  }).from(pageViews)
    .where(and(
      sql`${pageViews.path} NOT LIKE '/admin/%'`,
      sql`${pageViews.path} NOT LIKE '/api/%'`,
    ))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  const allPosts = await db.select().from(posts).where(eq(posts.status, 'published'));
  const postsBySlug = new Map(allPosts.map(p => [p.slug, p]));

  return results.map(row => {
    const path = decodePath(row.path);
    const segments = path.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];
    const post = slug ? postsBySlug.get(slug) : undefined;
    const label = post
      ? post.title
      : (STATIC_PAGE_LABELS[path] ?? path);
    return { path, label, views: row.count };
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

// Bot user-agent classification (read-side only; shared with getDeviceBreakdown so the
// predicate has a single definition). FALSE for null UA, so unknown-UA hits stay counted
// in UV — matching getDeviceBreakdown's null→'unknown' (not 'bot') branch.
const isBotSql = sql`(${pageViews.userAgent} is not null and (
  lower(${pageViews.userAgent}) like '%bot%'
  or lower(${pageViews.userAgent}) like '%spider%'
  or lower(${pageViews.userAgent}) like '%crawl%'))`;

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
}

export async function getVisitTrends(period: string = 'daily') {
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
}

export async function getReferrers(limit: number = 10) {
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
}

export async function getDeviceBreakdown() {
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
    .groupBy(deviceType)
    .orderBy(desc(sql`count(*)`));

  return rows;
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
