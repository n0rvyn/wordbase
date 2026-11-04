import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { app } from '../app.js';
import { apiKeys } from '../db/schema.js';
import { db } from '../db/index.js';
import { posts, pageViews, redirects, shareEvents } from '../db/schema.js';
import { getPostObservability } from '../services/post-observability.service.js';
import {
  getPostPageViews,
  getTopPosts,
  getTopPages,
  recordPageView,
  getVisitorSummary,
  getDeviceBreakdown,
} from '../services/analytics.service.js';
import { getDataQuality } from '../services/data-quality.service.js';
import { hashIp } from '../lib/hash-ip.js';
import { reportingWindow } from '../lib/reporting.js';
import { articleResolver } from '../lib/article-path.js';
import { normalizeAnalyticsIp } from '../lib/analytics-identity.js';
import { observabilityRouter } from '../routes/observability.js';
import { registerTools } from '../mcp/tools.js';
beforeEach(async () => {
  for (const t of [pageViews, posts, redirects, shareEvents])
    await db.delete(t);
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 4, 12));
});
afterEach(() => vi.restoreAllMocks());
async function seed() {
  const { from, to } = reportingWindow(30);
  const createdAt = from + 10;
  await db.insert(posts).values([
    {
      id: 'a',
      slug: 'hello',
      title: 'Article A',
      content: '',
      status: 'published',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'b',
      slug: 'hello-extra',
      title: 'Article B',
      content: '',
      status: 'published',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'c',
      slug: '午夜',
      title: 'Article C',
      content: '',
      status: 'published',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'zero',
      slug: 'no-views',
      title: 'No views',
      content: '',
      status: 'published',
      createdAt,
      updatedAt: createdAt,
    },
  ]);
  await db.insert(redirects).values({
    id: 'r',
    fromPath: '/legacy',
    toPath: '/posts/hello',
    statusCode: 301,
    createdAt,
  });
  const view = (
    path: string,
    visitorId: string | null = 'v1',
    extra: any = {},
  ) => ({ path, visitorId, userAgent: 'Mozilla/5.0', createdAt, ...extra });
  await db
    .insert(pageViews)
    .values([
      view('/posts/hello'),
      view('/posts/hello'),
      view('/en/posts/hello'),
      view('/posts/hello.html', 'v2'),
      view('/legacy', 'v3'),
      view('/posts/hello', null, { ipHash: hashIp('unknown') }),
      view('/posts/hello-extra', 'v4'),
      view('/tags/hello', 'v5'),
      view('/other/posts/hello', 'v6'),
      view('/posts/%E5%8D%88%E5%A4%9C', 'v7'),
      view('/posts/missing', 'v8'),
      view('/posts/hello', 'bot', { userAgent: 'Googlebot' }),
      view('/posts/hello', 'old', { createdAt: from - 1 }),
      view('/posts/hello', 'future', { createdAt: to }),
    ]);
  await db.insert(shareEvents).values([
    { path: '/en/posts/hello', target: 'copy', createdAt },
    { path: '/tags/hello', target: 'copy', createdAt },
  ]);
}
describe('per-article evidence', () => {
  it('matches exact routes, aliases and encoded slugs, filters bots and UTC boundaries, and retains zero-view posts', async () => {
    await seed();
    const q = getPostObservability(30, 'daily'),
      a = q.rows.find((p) => p.id === 'a')!;
    expect(a).toMatchObject({
      views: 6,
      estimatedVisitors: 3,
      identifiedViews: 5,
      unidentifiedViews: 1,
      botViews: 1,
      aliasViews: 1,
      shareClicks: 1,
      localeViews: { default: 5, en: 1 },
    });
    expect(a.trend.reduce((sum, r) => sum + r.views, 0)).toBe(a.views);
    expect(q.rows.find((p) => p.id === 'b')?.views).toBe(1);
    expect(q.rows.find((p) => p.id === 'c')?.views).toBe(1);
    expect(q.rows.find((p) => p.id === 'zero')?.views).toBe(0);
    expect(q.unmatchedArticleViews).toBe(1);
    expect(JSON.stringify(q)).not.toContain(hashIp('unknown'));
    expect(JSON.stringify(q)).not.toContain('v1');
  });
  it('aligns the legacy per-post response with the selected window while keeping its response shape', async () => {
    await seed();
    expect(await getPostPageViews('a', 30)).toEqual({
      postId: 'a',
      slug: 'hello',
      pageViews: 6,
    });
    expect(await getPostPageViews('a')).toEqual({
      postId: 'a',
      slug: 'hello',
      pageViews: 7,
    });
    expect(await getPostPageViews('absent')).toBeNull();
  });
  it('uses the shared resolver in article and page rankings', async () => {
    await seed();
    const top = await getTopPosts(10);
    expect(top.find((p) => p.postId === 'a')?.views).toBe(7);
    const pages = await getTopPages(10, 30);
    expect(pages.find((p) => p.label === 'Article A')?.views).toBe(6);
  });
  it('returns the same snapshot through MCP and keeps REST authenticated', async () => {
    await seed();
    expect((await observabilityRouter.request('/posts?days=30')).status).toBe(
      401,
    );
    let handler: any;
    registerTools(
      {
        tool(n: string, _d: any, _s: any, h: any) {
          if (n === 'observability_query') handler = h;
        },
      } as any,
      ['*'],
    );
    const r = await handler({
      section: 'post-metrics',
      days: 30,
      period: 'daily',
    });
    expect(JSON.parse(r.content[0].text)).toEqual(
      getPostObservability(30, 'daily'),
    );
  });
  it('serves the same article snapshot and observation metadata through authenticated REST', async () => {
    await seed();
    const key = 'test-post-observability-fixture';
    await db
      .insert(apiKeys)
      .values({
        id: 'post-observability-fixture',
        name: 'In-memory test',
        keyPrefix: key.slice(0, 8),
        keyHash: await bcrypt.hash(key, 4),
        permissions: '["observability:read","analytics:read"]',
        createdAt: Math.floor(Date.now() / 1000),
      });
    const headers = { Authorization: `Bearer ${key}` };
    const response = await app.request(
      '/api/observability/posts?days=30&period=daily',
      { headers },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(getPostObservability(30, 'daily'));
    expect(
      JSON.parse(response.headers.get('X-Wordbase-Observation')!).definition,
    ).toContain('Exact article matching');
    const legacy = await app.request('/api/analytics/posts/a?days=30', {
      headers,
    });
    expect(await legacy.json()).toEqual({
      postId: 'a',
      slug: 'hello',
      pageViews: 6,
    });
  });
  it('does not follow external aliases or redirect cycles', () => {
    const resolve = articleResolver(
      [{ id: 'a', slug: 'hello' }],
      [
        { fromPath: '/external', toPath: 'https://other.example/posts/hello' },
        { fromPath: '/cycle-a', toPath: '/cycle-b' },
        { fromPath: '/cycle-b', toPath: '/cycle-a' },
        { fromPath: '/tags/hello', toPath: '/posts/hello' },
        { fromPath: '/published-page', toPath: '/posts/hello' },
      ],
      ['/published-page'],
    );
    expect(resolve('/published-page')).toBeNull();
    expect(resolve('/external')).toBeNull();
    expect(resolve('/cycle-a')).toBeNull();
    expect(resolve('/tags/hello')).toBeNull();
  });
});
describe('honest missing-header handling', () => {
  it('normalizes header lists consistently and rejects missing/private/loopback fallbacks without losing views', async () => {
    expect(normalizeAnalyticsIp('81.2.69.142, 127.0.0.1')).toBe('81.2.69.142');
    for (const ip of [
      'unknown',
      '127.0.0.1',
      '::1',
      '10.0.0.1',
      '192.168.1.1',
      'invalid',
    ])
      expect(normalizeAnalyticsIp(ip)).toBeUndefined();
    const r = await recordPageView({
      path: '/',
      ipAddress: 'unknown',
      userAgent: 'unknown',
    });
    expect(r.ipHash).toBeNull();
    expect(r.userAgent).toBeNull();
    expect((await getVisitorSummary(30)).pageViews).toBe(1);
    expect((await getVisitorSummary(30)).uniqueVisitors).toBe(0);
  });
  it('classifies historical sentinels honestly without rewriting stored rows', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await db.insert(pageViews).values([
      { path: '/', ipHash: hashIp('unknown'), userAgent: 'unknown', createdAt },
      { path: '/', ipHash: hashIp('127.0.0.1'), userAgent: '', createdAt },
    ]);
    expect((await getVisitorSummary(30)).uniqueVisitors).toBe(0);
    expect(getDataQuality(30).browser).toMatchObject({
      counted: 2,
      unidentifiedRows: 2,
      ipFallbackRows: 0,
      unknownUserAgentRows: 2,
      usableIpRows:0,unusableIpRows:2,
    });
    expect(await getDeviceBreakdown(30)).toEqual([
      { type: 'unknown', count: 2 },
    ]);
    expect(
      (await db.select().from(pageViews)).every((r) => r.ipHash !== null),
    ).toBe(true);
  });
});
