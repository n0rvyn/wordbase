import { and, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  pageViews,
  shareEvents,
  podcastEvents,
  requestMetrics,
} from '../db/schema.js';
import { isBotSql, visitorKeySql, usableIpHashSql, unknownAgentSql } from '../lib/analytics-identity.js';
import { geoipEnabled } from '../lib/geoip.js';
import { reportingWindow } from '../lib/reporting.js';
import { cachedSync } from '../lib/ttl-cache.js';

/** Aggregate collection coverage, never raw identifiers. All counts share one
 * transaction and cutoff; cache observation time is distinct from event time. */
export function getDataQuality(days = 30) {
  days = Math.max(
    1,
    Math.min(365, Math.floor(Number.isFinite(days) ? days : 30)),
  );
  return cachedSync(`dataQuality:${days}`, 60_000, () =>
    db.transaction((tx) => {
      const window = reportingWindow(days);
      const audience = and(
        gte(pageViews.createdAt, window.from),
        lt(pageViews.createdAt, window.to),
      );
      const counted = sql`not (${isBotSql})`;
      const [browser] = tx
        .select({
          captured: sql<number>`count(*)`,
          counted: sql<number>`coalesce(sum(case when ${counted} then 1 else 0 end),0)`,
          excludedBots: sql<number>`coalesce(sum(case when ${isBotSql} then 1 else 0 end),0)`,
          browserIdRows: sql<number>`coalesce(sum(case when ${counted} and nullif(trim(${pageViews.visitorId}),'') is not null then 1 else 0 end),0)`,
          ipFallbackRows: sql<number>`coalesce(sum(case when ${counted} and nullif(trim(${pageViews.visitorId}),'') is null and ${usableIpHashSql(pageViews.ipHash)} is not null then 1 else 0 end),0)`,
          unidentifiedRows: sql<number>`coalesce(sum(case when ${counted} and ${visitorKeySql} is null then 1 else 0 end),0)`,
          unknownUserAgentRows: sql<number>`coalesce(sum(case when ${counted} and ${unknownAgentSql} then 1 else 0 end),0)`,
          usableIpRows: sql<number>`coalesce(sum(case when ${counted} and ${usableIpHashSql(pageViews.ipHash)} is not null then 1 else 0 end),0)`,
          unusableIpRows: sql<number>`coalesce(sum(case when ${counted} and ${usableIpHashSql(pageViews.ipHash)} is null then 1 else 0 end),0)`,
          geolocatedRows: sql<number>`coalesce(sum(case when ${counted} and ${pageViews.country} is not null then 1 else 0 end),0)`,
          unlocatedRows: sql<number>`coalesce(sum(case when ${counted} and ${pageViews.country} is null then 1 else 0 end),0)`,
          withReferrerRows: sql<number>`coalesce(sum(case when ${counted} and ${pageViews.referrer} is not null and ${pageViews.referrer} <> '' then 1 else 0 end),0)`,
          withoutReferrerRows: sql<number>`coalesce(sum(case when ${counted} and (${pageViews.referrer} is null or ${pageViews.referrer} = '') then 1 else 0 end),0)`,
          lastCountedAt: sql<
            number | null
          >`max(case when ${counted} then ${pageViews.createdAt} end)`,
        })
        .from(pageViews)
        .where(audience)
        .all();
      const [podcast] = tx
        .select({
          downloadRequests: sql<number>`coalesce(sum(case when event_type='download' then 1 else 0 end),0)`,
          unidentifiableDownloads: sql<number>`coalesce(sum(case when event_type='download' and (${usableIpHashSql(podcastEvents.ipHash)} is null or episode_id is null) then 1 else 0 end),0)`,
          feedRequests: sql<number>`coalesce(sum(case when event_type='feed_poll' then 1 else 0 end),0)`,
          unidentifiableFeedPolls: sql<number>`coalesce(sum(case when event_type='feed_poll' and ${usableIpHashSql(podcastEvents.ipHash)} is null then 1 else 0 end),0)`,
        })
        .from(podcastEvents)
        .where(
          and(
            gte(podcastEvents.createdAt, window.from),
            lt(podcastEvents.createdAt, window.to),
          ),
        )
        .all();
      function source(
        table:
          | typeof pageViews
          | typeof shareEvents
          | typeof podcastEvents
          | typeof requestMetrics,
        key: string,
        label: string,
        retention: string,
      ) {
        const [row] = tx
          .select({
            firstRetainedAt: sql<number | null>`min(${table.createdAt})`,
            lastRetainedAt: sql<number | null>`max(${table.createdAt})`,
            windowEvents: sql<number>`coalesce(sum(case when ${table.createdAt} >= ${window.from} then 1 else 0 end),0)`,
          })
          .from(table)
          .where(lt(table.createdAt, window.to))
          .all();
        return { key, label, ...row, retention };
      }
      return {
        days,
        window,
        browser,
        podcast,
        geoipReady: geoipEnabled(),
        sources: [
          source(
            pageViews,
            'browser',
            'Browser beacons',
            'No automatic pruning configured',
          ),
          source(
            shareEvents,
            'shares',
            'Share clicks',
            'No automatic pruning configured',
          ),
          source(
            podcastEvents,
            'podcast',
            'Podcast requests',
            'Downloads retained; feed polls pruned after approximately 90 days',
          ),
          source(
            requestMetrics,
            'requests',
            'API request timings',
            'Pruned after approximately 30 days',
          ),
        ],
        limitations: [
          'Only received events are measurable; blocked or missing browser beacons have no known denominator.',
          'No expected traffic frequency is configured. Silence does not establish an outage.',
          'Visitor IDs and IP fallbacks are estimates; common unknown/loopback hash fallbacks are excluded and other historical proxy hashes remain unverifiable; shared/proxied IPs can merge visitors. No raw identifiers are exposed here.',
          'Unique visitors are not additive across chart buckets. Page visits use fixed visitor/path/30-minute buckets, not journeys.',
          'Country and referrer coverage describe counted beacons only; missing referrers are direct or unattributed, not proven direct visits.',
          'API timing excludes observability polling, health checks, preflights, uploads and unmatched routes; it does not cover static pages, TLS or Caddy.',
          'Podcast downloads and feed polls are requests, not completed listening or subscribers.',
        ],
      };
    }),
  );
}
