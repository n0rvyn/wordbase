import { sql, gte, eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { podcastEvents, podcastEpisodes } from '../db/schema.js';
import { hashIp } from '../lib/hash-ip.js';

// Podcast consumption analytics. Same philosophy as analytics.service.ts: the
// podcast_events table keeps the raw hit stream untouched and every count here is
// deduplicated at READ time, so we can report raw and deduped from one source.
//
//   download  → deduped per (ip_hash, episode_id, 30-min window): a client's burst
//               of range/resume requests within one window folds into one download.
//   feed_poll → deduped per (ip_hash, podcast_id, 1-day window): distinct daily
//               endpoints over a recent window estimate active subscribers.

const DOWNLOAD_WINDOW_SECONDS = 1800; // 30 min
const FEED_WINDOW_SECONDS = 86400; // 1 day
const FEED_RETENTION_DAYS = 90; // feed_poll is high-volume; subscriber estimate only needs a recent window
const SUBSCRIBER_WINDOW_DAYS = 7; // distinct feed-poll endpoints over the last week

// Per-row dedup fingerprints. ip_hash may be null (unknown IP); SQLite skips null
// keys in COUNT(DISTINCT), so an unidentifiable hit is not a countable download/endpoint.
// The window divisor is inlined as an integer literal and the quotient cast to INTEGER
// to force floor division (a bound numeric param makes SQLite do REAL division → no dedup).
const downloadKeySql = sql<string>`${podcastEvents.ipHash} || '|' || ${podcastEvents.episodeId} || '|' || cast(${podcastEvents.createdAt} / ${sql.raw(String(DOWNLOAD_WINDOW_SECONDS))} as integer)`;
const feedKeySql = sql<string>`${podcastEvents.ipHash} || '|' || cast(${podcastEvents.createdAt} / ${sql.raw(String(FEED_WINDOW_SECONDS))} as integer)`;

export interface RecordPodcastEventInput {
  eventType: 'download' | 'feed_poll';
  podcastId: string;
  episodeId?: string | null;
  userAgent?: string;
  ipAddress?: string;
  referrer?: string | null;
}

export async function recordPodcastEvent(input: RecordPodcastEventInput) {
  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(podcastEvents).values({
    eventType: input.eventType,
    podcastId: input.podcastId,
    episodeId: input.episodeId ?? null,
    ipHash: input.ipAddress ? hashIp(input.ipAddress) : null,
    userAgent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    createdAt: now,
  }).returning();

  // Probabilistic retention for feed_poll only (downloads are kept for lifetime
  // totals; feed polls are high-volume and only the recent window is meaningful).
  if (input.eventType === 'feed_poll' && Math.random() < 0.005) {
    await db.delete(podcastEvents).where(
      and(eq(podcastEvents.eventType, 'feed_poll'), sql`${podcastEvents.createdAt} < ${now - FEED_RETENTION_DAYS * 86400}`),
    );
  }

  return record;
}

export async function getPodcastSummary(days: number = 30) {
  const now = Math.floor(Date.now() / 1000);
  const windowSince = now - days * 86400;
  const subSince = now - SUBSCRIBER_WINDOW_DAYS * 86400;

  const [totals] = await db.select({
    totalDownloads: sql<number>`count(distinct (${downloadKeySql}))`,
  }).from(podcastEvents).where(eq(podcastEvents.eventType, 'download'));

  const [windowed] = await db.select({
    windowDownloads: sql<number>`count(distinct (${downloadKeySql}))`,
  }).from(podcastEvents).where(and(eq(podcastEvents.eventType, 'download'), gte(podcastEvents.createdAt, windowSince)));

  const [subs] = await db.select({
    subscriberEstimate: sql<number>`count(distinct (${feedKeySql}))`,
  }).from(podcastEvents).where(and(eq(podcastEvents.eventType, 'feed_poll'), gte(podcastEvents.createdAt, subSince)));

  return {
    days,
    totalDownloads: totals.totalDownloads,
    windowDownloads: windowed.windowDownloads,
    subscriberEstimate: subs.subscriberEstimate,
    subscriberWindowDays: SUBSCRIBER_WINDOW_DAYS,
  };
}

export async function getPodcastTrends(period: string = 'daily') {
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

  const bucket = sql<string>`strftime('${sql.raw(groupFormat)}', datetime(${podcastEvents.createdAt}, 'unixepoch'))`;

  const results = await db.select({
    period: bucket,
    downloads: sql<number>`count(distinct (${downloadKeySql}))`,
    feedPolls: sql<number>`count(distinct (${feedKeySql}))`,
  }).from(podcastEvents)
    .groupBy(bucket)
    .orderBy(desc(bucket))
    .limit(groupCount);

  return results.reverse(); // chronological order
}

export async function getTopEpisodes(limit: number = 10) {
  const rows = await db.select({
    episodeId: podcastEvents.episodeId,
    title: podcastEpisodes.title,
    slug: podcastEpisodes.slug,
    downloads: sql<number>`count(distinct (${downloadKeySql}))`,
  }).from(podcastEvents)
    .innerJoin(podcastEpisodes, eq(podcastEvents.episodeId, podcastEpisodes.id))
    .where(eq(podcastEvents.eventType, 'download'))
    .groupBy(podcastEvents.episodeId)
    .orderBy(desc(sql`count(distinct (${downloadKeySql}))`))
    .limit(limit);

  return rows;
}

// Powers the per-episode detail table: every episode (download or not) with its
// deduped lifetime downloads plus a short recent-trend array for an inline sparkline.
export async function getEpisodeDownloadTable(trendDays: number = 14) {
  const now = Math.floor(Date.now() / 1000);

  // Contiguous UTC day axis (oldest → today) so every episode's sparkline has the
  // same length. Build it first, then derive the query boundary from the oldest
  // day's 00:00 UTC — this keeps the filter and the axis exactly aligned (a raw
  // now-Nd boundary would admit a 15th partial day with no matching axis bucket).
  const dayKeys: string[] = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    dayKeys.push(new Date((now - i * 86400) * 1000).toISOString().slice(0, 10));
  }
  const trendSince = Math.floor(Date.parse(`${dayKeys[0]}T00:00:00Z`) / 1000);

  // Lifetime deduped downloads per episode id.
  const totals = await db.select({
    episodeId: podcastEvents.episodeId,
    downloads: sql<number>`count(distinct (${downloadKeySql}))`,
  }).from(podcastEvents)
    .where(eq(podcastEvents.eventType, 'download'))
    .groupBy(podcastEvents.episodeId);
  const totalByEp = new Map(totals.map((r) => [r.episodeId, r.downloads]));

  // Recent daily deduped downloads per episode, for the sparkline.
  const dayBucket = sql<string>`strftime('%Y-%m-%d', datetime(${podcastEvents.createdAt}, 'unixepoch'))`;
  const dailyRows = await db.select({
    episodeId: podcastEvents.episodeId,
    day: dayBucket,
    downloads: sql<number>`count(distinct (${downloadKeySql}))`,
  }).from(podcastEvents)
    .where(and(eq(podcastEvents.eventType, 'download'), gte(podcastEvents.createdAt, trendSince)))
    .groupBy(podcastEvents.episodeId, dayBucket);

  const trendByEp = new Map<string, Map<string, number>>();
  for (const r of dailyRows) {
    if (!r.episodeId) continue;
    let m = trendByEp.get(r.episodeId);
    if (!m) { m = new Map(); trendByEp.set(r.episodeId, m); }
    m.set(r.day, r.downloads);
  }

  // List every episode (published or not), newest first.
  const episodes = await db.select({
    id: podcastEpisodes.id,
    title: podcastEpisodes.title,
    slug: podcastEpisodes.slug,
    episodeNumber: podcastEpisodes.episodeNumber,
    publishedAt: podcastEpisodes.publishedAt,
    status: podcastEpisodes.status,
  }).from(podcastEpisodes)
    .orderBy(desc(podcastEpisodes.publishedAt), desc(podcastEpisodes.createdAt));

  return episodes.map((ep) => {
    const m = trendByEp.get(ep.id);
    const trend = dayKeys.map((d) => (m?.get(d) ?? 0));
    return {
      id: ep.id,
      title: ep.title,
      slug: ep.slug,
      episodeNumber: ep.episodeNumber,
      status: ep.status,
      downloads: totalByEp.get(ep.id) ?? 0,
      trend,
    };
  });
}

// Feed-poll user agents → podcast client distribution. Mirrors getDeviceBreakdown's
// CASE classification, tuned for podcast client UA signatures.
export async function getPodcastClients(limit: number = 10) {
  const client = sql<string>`case
    when ${podcastEvents.userAgent} is null then 'unknown'
    when lower(${podcastEvents.userAgent}) like '%apple%podcast%' or lower(${podcastEvents.userAgent}) like '%itunes%' then 'Apple Podcasts'
    when lower(${podcastEvents.userAgent}) like '%overcast%' then 'Overcast'
    when lower(${podcastEvents.userAgent}) like '%spotify%' then 'Spotify'
    when lower(${podcastEvents.userAgent}) like '%pocketcasts%' or lower(${podcastEvents.userAgent}) like '%pocket casts%' then 'Pocket Casts'
    when lower(${podcastEvents.userAgent}) like '%castro%' then 'Castro'
    when lower(${podcastEvents.userAgent}) like '%xiaoyuzhou%' or ${podcastEvents.userAgent} like '%小宇宙%' then '小宇宙'
    when lower(${podcastEvents.userAgent}) like '%antennapod%' then 'AntennaPod'
    when lower(${podcastEvents.userAgent}) like '%bot%' or lower(${podcastEvents.userAgent}) like '%spider%' or lower(${podcastEvents.userAgent}) like '%crawl%' then 'bot'
    else 'Other' end`;

  const rows = await db.select({
    type: client,
    count: sql<number>`count(distinct (${feedKeySql}))`,
  }).from(podcastEvents)
    .where(eq(podcastEvents.eventType, 'feed_poll'))
    .groupBy(client)
    .orderBy(desc(sql`count(distinct (${feedKeySql}))`))
    .limit(limit);

  return rows;
}
