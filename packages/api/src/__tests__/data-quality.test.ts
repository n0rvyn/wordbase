import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { db } from '../db/index.js';
import {
  pageViews,
  shareEvents,
  podcastEvents,
  requestMetrics,
} from '../db/schema.js';
import { getDataQuality } from '../services/data-quality.service.js';
import { getVisitorSummary } from '../services/analytics.service.js';
import { getRequestMetrics } from '../services/observability.service.js';
import { reportingWindow } from '../lib/reporting.js';
import { observabilityRouter } from '../routes/observability.js';
import { registerTools } from '../mcp/tools.js';
beforeEach(async () => {
  for (const table of [pageViews, shareEvents, podcastEvents, requestMetrics])
    await db.delete(table);
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 4, 12));
});
afterEach(() => vi.restoreAllMocks());
describe('collection quality uses real denominators', () => {
  it('requires authentication at the new REST endpoint', async () => {
    const response = await observabilityRouter.request('/data-quality?days=30');
    expect(response.status).toBe(401);
  });
  it('accounts for bots, anonymous rows, IP fallback, missing geography and referrers in the same window', async () => {
    const { from, to } = reportingWindow(30);
    const base = { path: '/', createdAt: from };
    await db
      .insert(pageViews)
      .values([
        {
          ...base,
          userAgent: 'Mozilla/5.0',
          visitorId: 'browser',
          country: 'US',
          referrer: 'https://example.com',
        },
        {
          ...base,
          userAgent: 'Mozilla/5.0',
          ipHash: 'private-hash-fixture-never-export',
        },
        { ...base },
        { ...base, userAgent: 'Googlebot', visitorId: 'bot', country: 'US' },
        { ...base, createdAt: from - 1 },
        { ...base, createdAt: to },
      ]);
    const q = getDataQuality(30);
    expect(q.browser).toMatchObject({
      captured: 4,
      counted: 3,
      excludedBots: 1,
      browserIdRows: 1,
      ipFallbackRows: 1,
      unidentifiedRows: 1,
      geolocatedRows: 1,
      unlocatedRows: 2,
      withReferrerRows: 1,
      withoutReferrerRows: 2,
      unknownUserAgentRows: 1,
      lastCountedAt: from,
    });
    expect(q.browser.counted).toBe((await getVisitorSummary(30)).pageViews);
    expect(q.browser.captured).toBe(q.browser.counted + q.browser.excludedBots);
    expect(q.sources[0].firstRetainedAt).toBe(from - 1);
    expect(q.sources[0].lastRetainedAt).toBe(from);
    expect(JSON.stringify(q)).not.toContain(
      'private-hash-fixture-never-export',
    );
  });
  it('distinguishes an empty measurement from unknown event times and flags undeduplicable podcast requests', async () => {
    const empty = getDataQuality(30);
    expect(empty.browser.captured).toBe(0);
    expect(empty.browser.lastCountedAt).toBeNull();
    expect(empty.sources.every((s) => s.firstRetainedAt === null)).toBe(true);
    const createdAt = Math.floor(Date.now() / 1000);
    await db.insert(podcastEvents).values([
      { eventType: 'download', podcastId: 'p', episodeId: 'e', createdAt },
      {
        eventType: 'download',
        podcastId: 'p',
        episodeId: 'e',
        ipHash: 'x',
        createdAt,
      },
      { eventType: 'feed_poll', podcastId: 'p', createdAt },
    ]);
    expect(getDataQuality(30).podcast).toEqual({
      downloadRequests: 2,
      unidentifiableDownloads: 1,
      feedRequests: 1,
      unidentifiableFeedPolls: 1,
    });
  });
  it('returns identical data through the MCP read tool without raw identifiers', async () => {
    let handler: any;
    registerTools(
      {
        tool(name: string, _d: any, _s: any, h: any) {
          if (name === 'observability_query') handler = h;
        },
      } as any,
      ['*'],
    );
    const result = await handler({ section: 'data-quality', days: 7 });
    expect(JSON.parse(result.content[0].text)).toEqual(getDataQuality(7));
    expect(JSON.parse(result.content[1].text).observation.source).toContain(
      'coverage',
    );
  });
});
describe('request timing accuracy', () => {
  it('measures the whole-sample p95 and separates client/server responses, excluding future events', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await db.insert(requestMetrics).values([
      { method: 'GET', route: '/a', status: 200, durationMs: 10, createdAt },
      { method: 'GET', route: '/a', status: 404, durationMs: 20, createdAt },
      { method: 'GET', route: '/b', status: 503, durationMs: 1000, createdAt },
      {
        method: 'GET',
        route: '/b',
        status: 500,
        durationMs: 9999,
        createdAt: createdAt + 60,
      },
    ]);
    const m = await getRequestMetrics(24);
    expect(m.totalRequests).toBe(3);
    expect(m.clientErrors).toBe(1);
    expect(m.serverErrors).toBe(1);
    expect(m.latency).toEqual({ avgMs: 343.3, p50Ms: 20, p95Ms: 1000 });
  });
  it('has no latency sample when there are no requests', async () => {
    expect((await getRequestMetrics()).latency).toBeNull();
  });
});
