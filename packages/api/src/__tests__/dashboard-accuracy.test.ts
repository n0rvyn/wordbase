import { sql } from 'drizzle-orm';
import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { db } from '../db/index.js';
import { pageViews,posts,comments,podcastEvents,podcasts,podcastEpisodes } from '../db/schema.js';
import { getVisitorSummary,getVisitTrends,getTopPages,getReferrers,getOverview } from '../services/analytics.service.js';
import { getCommentCounts } from '../services/comment.service.js';
import { getSystemStatus } from '../services/observability.service.js';
import { getPodcastTrends,getPodcastSummary } from '../services/podcast-analytics.service.js';
import { observation } from '../services/observation.service.js';
import { clearCache,setCacheEnabled } from '../lib/ttl-cache.js';
import { bucketKey } from '../lib/reporting.js';
const now=Date.parse('2026-11-04T10:20:00Z');
beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(now);clearCache();setCacheEnabled(false);await db.delete(comments);await db.delete(posts);await db.delete(pageViews);await db.delete(podcastEvents);await db.delete(podcastEpisodes);await db.delete(podcasts);});
afterEach(()=>{vi.useRealTimers();clearCache();setCacheEnabled(false);});
function view(id:string,at:string,ua='Mozilla/5.0') {return {path:'/about',referrer:'https://example.org/read',visitorId:id,userAgent:ua,ipHash:id,createdAt:Date.parse(at)/1000};}
describe('dashboard measurements',()=>{
 it('aligns summary, filled trend and selected rankings across UTC boundaries',async()=>{
  await db.insert(pageViews).values([view('start','2026-10-06T00:00:00Z'),view('today','2026-11-04T00:00:00Z'),view('old','2026-10-05T23:59:59Z'),view('future','2026-11-05T00:00:00Z'),view('bot','2026-11-04T00:00:00Z','Googlebot')]);
  const summary=await getVisitorSummary(30);const trends=await getVisitTrends('daily');
  expect(summary.pageViews).toBe(2);expect(trends).toHaveLength(30);expect(trends[0]).toMatchObject({period:'2026-10-06',pageViews:1});expect(trends[1].pageViews).toBe(0);
  expect(trends.reduce((n,r)=>n+r.pageViews,0)).toBe(summary.pageViews);
  expect((await getTopPages(10,30))[0].views).toBe(2);expect((await getReferrers(10,30))[0].count).toBe(2);
  expect((await getOverview()).todayPageViews).toBe(1);
  for(const [period,days] of [['weekly',84],['monthly',365]] as const) {
   const bounded=await getVisitTrends(period);expect(bounded.reduce((n,row)=>n+row.pageViews,0)).toBe((await getVisitorSummary(days)).pageViews);
  }
 });
 it('counts pending comments outside the recent-post page and beyond comment pagination',async()=>{
  for(let i=0;i<8;i++)await db.insert(posts).values({id:'p'+i,slug:'p'+i,title:'p'+i,content:'x',status:'published',createdAt:i,updatedAt:i});
  await db.insert(comments).values(Array.from({length:27},(_,i)=>({id:'c'+i,postId:'p0',authorName:'test',content:'x',status:'pending',createdAt:i})));
  expect(getCommentCounts().pending).toBe(27);expect(getSystemStatus().ops.pendingComments).toBe(27);
 });
 it('reports true cached generation time instead of labeling cached data as newly measured',async()=>{
  setCacheEnabled(true);await getVisitorSummary(30);const first=observation('visits',{days:30});
  vi.setSystemTime(now+45_000);await getVisitorSummary(30);expect(observation('visits',{days:30}).observedAt).toBe(first.observedAt);
  vi.setSystemTime(now+61_000);await getVisitorSummary(30);expect(observation('visits',{days:30}).observedAt).toBe(now+61_000);
 });
 it('separates feed polls from downloads, fills empty podcast buckets and reconciles totals',async()=>{
  await db.insert(podcasts).values({id:'pod',slug:'pod',title:'Pod',description:'x',author:'a',language:'en',status:'published',createdAt:1,updatedAt:1});
  await db.insert(podcastEpisodes).values({id:'ep',podcastId:'pod',slug:'ep',title:'Ep',guid:'ep-guid',audioUrl:'/fixture.mp3',status:'published',createdAt:1,updatedAt:1});
  const t=now/1000;
  await db.insert(podcastEvents).values([{podcastId:'pod',eventType:'feed_poll',ipHash:'feed-only-ip',createdAt:t},{podcastId:'pod',episodeId:'ep',eventType:'download',ipHash:'download-only-ip',createdAt:t},{podcastId:'pod',episodeId:'ep',eventType:'download',ipHash:'download-only-ip',createdAt:t}]);
  const rows=await getPodcastTrends('daily');expect(rows).toHaveLength(30);expect(rows.at(-1)).toMatchObject({downloads:1,feedPolls:1});expect(rows.reduce((s,r)=>s+r.downloads,0)).toBe((await getPodcastSummary(30)).windowDownloads);
 });
 it('matches SQLite week labels around new year',()=>{
  for(const day of ['2026-01-01','2026-01-04','2026-01-05','2026-12-31','2027-01-01']) {
   const expected=db.get<{value:string}>(sql`select strftime('%Y-W%W', ${day}) as value`);
   expect(bucketKey(new Date(day+'T00:00:00Z'),'weekly')).toBe(expected.value);
  }
  expect(bucketKey(new Date('2026-01-01'),'weekly')).toBe('2026-W00');expect(bucketKey(new Date('2026-01-05'),'weekly')).toBe('2026-W01');
 });
});

describe('measurement metadata contract',()=>{
 it('labels lifetime and selected ranges explicitly and documents the real units',()=>{
  expect(observation('top-pages').range).toBe('All recorded history');
  expect(observation('top-pages',{days:84}).range).toContain('2026-08-13T00:00:00.000Z');
  expect(observation('visits').definition).toContain('not whole-site sessions');
  expect(observation('shares').definition).toContain('Clicks only');
  expect(observation('podcast-summary').definition).toContain('not unique subscribers');
 });
});
