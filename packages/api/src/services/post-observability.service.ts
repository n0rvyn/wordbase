import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  posts,
  pageViews,
  shareEvents,
  redirects,
  pages,
} from '../db/schema.js';
import {
  isBotSql,
  visitorKeySql,
  usableIpHashSql,
} from '../lib/analytics-identity.js';
import {
  articleResolver,
  analyticsPath,
  articleSlug,
} from '../lib/article-path.js';
import { reportingWindow, bucketKey, fillBuckets } from '../lib/reporting.js';
import { cachedSync } from '../lib/ttl-cache.js';

function postSnapshot(days: number | undefined, period: string) {
  return cachedSync(`postMetrics:${days ?? 'all'}:${period}`, 60_000, () =>
    db.transaction((tx) => {
      const window =
        days === undefined
          ? { from: 0, to: Math.floor(Date.now() / 1000) + 1 }
          : reportingWindow(days);
      const records = tx
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          status: posts.status,
          publishedAt: posts.publishedAt,
        })
        .from(posts)
        .all();
      const resolve = articleResolver(
        records,
        tx.select().from(redirects).all(),
        tx
          .select({ slug: pages.slug })
          .from(pages)
          .where(eq(pages.status, 'published'))
          .all()
          .flatMap((p) => [`/${p.slug}`, `/en/${p.slug}`]),
      );
      const groups = new Map(
        records.map((p) => [
          p.id,
          {
            ...p,
            views: 0,
            estimatedVisitors: 0,
            identifiedViews: 0,
            unidentifiedViews: 0,
            ipFallbackViews: 0,
            botViews: 0,
            geolocatedViews: 0,
            referrerViews: 0,
            lastViewedAt: null as number | null,
            aliasViews: 0,
            localeViews: { default: 0, en: 0 },
            shareClicks: 0,
            identities: new Set<string>(),
            buckets: new Map<string, number>(),
            hosts: new Map<string, number>(),
            countries: new Map<string, number>(),
          },
        ]),
      );
      const rows = tx
        .select({
          path: pageViews.path,
          visitor: visitorKeySql,
          hasBrowser: sql<number>`case when nullif(trim(${pageViews.visitorId}),'') is not null then 1 else 0 end`,
          usableIp: usableIpHashSql(pageViews.ipHash),
          bot: sql<number>`case when ${isBotSql} then 1 else 0 end`,
          country: pageViews.country,
          referrer: pageViews.referrer,
          createdAt: pageViews.createdAt,
        })
        .from(pageViews)
        .where(
          and(
            gte(pageViews.createdAt, window.from),
            lt(pageViews.createdAt, window.to),
          ),
        )
        .all();
      let unmatchedArticleViews = 0;
      for (const row of rows) {
        const match = resolve(row.path);
        if (!match) {
          if (!row.bot && articleSlug(analyticsPath(row.path) ?? ''))
            unmatchedArticleViews++;
          continue;
        }
        const g = groups.get(match.post.id)!;
        if (row.bot) {
          g.botViews++;
          continue;
        }
        g.views++;
        g.localeViews[match.locale]++;
        if (match.alias) g.aliasViews++;
        if (row.visitor) {
          g.identities.add(row.visitor);
          g.identifiedViews++;
          if (!row.hasBrowser) g.ipFallbackViews++;
        } else g.unidentifiedViews++;
        if (row.country) {
          g.geolocatedViews++;
          g.countries.set(row.country, (g.countries.get(row.country) ?? 0) + 1);
        }
        if (row.referrer) {
          g.referrerViews++;
          let host = 'Unparseable referrer';
          try {
            host = new URL(row.referrer).host || host;
          } catch {}
          g.hosts.set(host, (g.hosts.get(host) ?? 0) + 1);
        }
        g.lastViewedAt = Math.max(g.lastViewedAt ?? 0, row.createdAt);
        const bucket = bucketKey(new Date(row.createdAt * 1000), period);
        g.buckets.set(bucket, (g.buckets.get(bucket) ?? 0) + 1);
      }
      for (const row of tx
        .select({ path: shareEvents.path, count: sql<number>`count(*)` })
        .from(shareEvents)
        .where(
          and(
            gte(shareEvents.createdAt, window.from),
            lt(shareEvents.createdAt, window.to),
          ),
        )
        .groupBy(shareEvents.path)
        .all()) {
        const match = resolve(row.path);
        if (match) groups.get(match.post.id)!.shareClicks += row.count;
      }
      const result = [...groups.values()]
        .map(({ identities, buckets, hosts, countries, ...g }) => ({
          ...g,
          estimatedVisitors: identities.size,
          unlocatedViews: g.views - g.geolocatedViews,
          unattributedViews: g.views - g.referrerViews,
          trend: fillBuckets(
            [...buckets].map(([period, views]) => ({ period, views })),
            period,
            days ?? 30,
            { views: 0 },
          ),
          referrers: [...hosts]
            .map(([host, views]) => ({ host, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5),
          countries: [...countries]
            .map(([country, views]) => ({ country, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5),
        }))
        .sort(
          (a, b) =>
            b.views - a.views ||
            (b.publishedAt ?? 0) - (a.publishedAt ?? 0) ||
            a.id.localeCompare(b.id),
        );
      return {
        days: days ?? null,
        period,
        window,
        unmatchedArticleViews,
        rows: result,
      };
    }),
  );
}
export function getPostObservability(days = 30, period = 'daily') {
  days = Math.max(
    1,
    Math.min(365, Math.floor(Number.isFinite(days) ? days : 30)),
  );
  period = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'daily';
  const result = postSnapshot(days, period);
  return {
    ...result,
    rows: result.rows.filter((p) => p.status === 'published'),
  };
}
export function getSinglePostMetrics(postId: string, days?: number) {
  return postSnapshot(days, 'daily').rows.find((p) => p.id === postId) ?? null;
}
