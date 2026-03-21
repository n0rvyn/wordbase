import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pageViews, posts, postTags, tags } from '../db/schema.js';
import { createHash } from 'crypto';

export interface RecordPageViewInput {
  path: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
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
