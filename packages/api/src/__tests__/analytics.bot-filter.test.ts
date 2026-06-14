import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { pageViews } from '../db/schema.js';
import {
  recordPageView,
  getTotalPageViews,
  getTodayPageViews,
  getTrends,
  getVisitorSummary,
} from '../services/analytics.service.js';

beforeEach(async () => {
  await db.delete(pageViews);
});

// One human + three non-human agents on the same page. The broadened bot
// predicate must catch the classic crawler, the Facebook link-preview fetcher,
// and a scripting library agent.
async function seedMixed() {
  await recordPageView({ path: '/', ipAddress: '8.8.8.8', userAgent: 'Mozilla/5.0', visitorId: 'H1' });
  await recordPageView({ path: '/', ipAddress: '9.9.9.9', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)', visitorId: 'B1' });
  await recordPageView({ path: '/', ipAddress: '9.9.9.8', userAgent: 'facebookexternalhit/1.1', visitorId: 'B2' });
  await recordPageView({ path: '/', ipAddress: '9.9.9.7', userAgent: 'python-requests/2.31.0', visitorId: 'B3' });
}

describe('bot filtering on PV aggregations (MCP-facing + admin widgets)', () => {
  it('getTotalPageViews counts only the human view', async () => {
    await seedMixed();
    expect(await getTotalPageViews()).toBe(1);
  });

  it('getTodayPageViews counts only the human view', async () => {
    await seedMixed();
    expect(await getTodayPageViews()).toBe(1);
  });

  it('getTrends daily bucket counts only the human view', async () => {
    await seedMixed();
    const trends = await getTrends('daily');
    const latest = trends[trends.length - 1];
    expect(latest.count).toBe(1);
  });
});

describe('regression guard: getVisitorSummary keeps RAW page views (intentional design)', () => {
  it('still counts bots in pageViews while excluding them from uniqueVisitors', async () => {
    await seedMixed();
    const s = await getVisitorSummary(30);
    expect(s.pageViews).toBe(4);       // raw PV — bots NOT filtered here (by design)
    expect(s.uniqueVisitors).toBe(1);  // only the human
  });
});
