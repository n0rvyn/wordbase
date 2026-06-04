import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pageViews, posts, postTags, tags } from '../db/schema.js';
import { hashIp } from '../lib/hash-ip.js';

export interface RecordPageViewInput {
  path: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
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
    createdAt: now,
  }).returning();
  return record;
}

export async function getTotalPageViews() {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(pageViews);
  return result.count;
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

// SQL fragment for the per-row session fingerprint. ip_hash may be null
// (unknown IP); SQLite skips null keys in COUNT(DISTINCT), which is the
// desired behaviour (an unidentifiable hit is not a countable session).
//
// The window divisor is inlined as an integer literal via sql.raw and the
// quotient is cast to INTEGER: a bound numeric parameter makes SQLite do REAL
// division (each second a distinct bucket → no dedup), so we force integer
// floor division to land hits in the same 30-min bucket.
const sessionKeySql = sql<string>`${pageViews.ipHash} || '|' || ${pageViews.path} || '|' || cast(${pageViews.createdAt} / ${sql.raw(String(SESSION_WINDOW_SECONDS))} as integer)`;

export async function getVisitorSummary(days: number = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const [row] = await db.select({
    pageViews: sql<number>`count(*)`,
    uniqueVisitors: sql<number>`count(distinct ${pageViews.ipHash})`,
    sessions: sql<number>`count(distinct (${sessionKeySql}))`,
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
    uniqueVisitors: sql<number>`count(distinct ${pageViews.ipHash})`,
    sessions: sql<number>`count(distinct (${sessionKeySql}))`,
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
    when lower(${pageViews.userAgent}) like '%bot%'
      or lower(${pageViews.userAgent}) like '%spider%'
      or lower(${pageViews.userAgent}) like '%crawl%' then 'bot'
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
