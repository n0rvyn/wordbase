import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { podcastEvents, podcastEpisodes, podcasts } from '../db/schema.js';
import { resetNewTables } from './helpers.js';
import {
  getPodcastSummary,
  getTopEpisodes,
  getPodcastClients,
  getEpisodeDownloadTable,
} from '../services/podcast-analytics.service.js';

const SHOW_ID = 'show-analytics';
const now = Math.floor(Date.now() / 1000);

async function seedShowAndEpisodes() {
  await db.insert(podcasts).values({
    id: SHOW_ID, slug: 'analytics-show', title: 'Analytics Show',
    language: 'zh-CN', explicit: 0, status: 'published', createdAt: now, updatedAt: now,
  });
  for (const [id, slug, num] of [['ep1', 'ep-one', 1], ['ep2', 'ep-two', 2]] as const) {
    await db.insert(podcastEpisodes).values({
      id, podcastId: SHOW_ID, slug, guid: `guid-${id}`, title: `Episode ${num}`,
      audioUrl: `/uploads/${id}.mp3`, audioType: 'audio/mpeg', audioSize: 1000,
      episodeNumber: num, status: 'published', publishedAt: now, createdAt: now, updatedAt: now,
    });
  }
}

function ev(eventType: 'download' | 'feed_poll', opts: { episodeId?: string; ipHash?: string; userAgent?: string; createdAt: number }) {
  return {
    eventType, podcastId: SHOW_ID,
    episodeId: opts.episodeId ?? null,
    ipHash: opts.ipHash ?? null,
    userAgent: opts.userAgent ?? null,
    referrer: null,
    createdAt: opts.createdAt,
  };
}

beforeEach(async () => {
  await resetNewTables();
  await seedShowAndEpisodes();
});

describe('download dedup (30-min window)', () => {
  it('folds same ip+episode within one window, counts distinct windows separately', async () => {
    await db.insert(podcastEvents).values([
      // ep1: two hits in the same 30-min bucket (now) → 1; one hit 1h earlier (different bucket) → +1 = 2
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now }),
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now }),
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now - 3600 }),
      // ep2: single hit → 1
      ev('download', { episodeId: 'ep2', ipHash: 'b', createdAt: now }),
    ]);

    const summary = await getPodcastSummary(30);
    expect(summary.totalDownloads).toBe(3); // 2 (ep1) + 1 (ep2)
    expect(summary.windowDownloads).toBe(3); // all within 30d
  });

  it('a different ip in the same window counts as a separate download', async () => {
    await db.insert(podcastEvents).values([
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now }),
      ev('download', { episodeId: 'ep1', ipHash: 'c', createdAt: now }),
    ]);
    const summary = await getPodcastSummary(30);
    expect(summary.totalDownloads).toBe(2);
  });
});

describe('getTopEpisodes', () => {
  it('ranks episodes by deduped downloads, joined to title/slug', async () => {
    await db.insert(podcastEvents).values([
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now }),
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now - 3600 }),
      ev('download', { episodeId: 'ep2', ipHash: 'b', createdAt: now }),
    ]);
    const top = await getTopEpisodes(10);
    expect(top[0]).toMatchObject({ episodeId: 'ep1', title: 'Episode 1', slug: 'ep-one', downloads: 2 });
    expect(top[1]).toMatchObject({ episodeId: 'ep2', downloads: 1 });
  });
});

describe('subscriber estimate (feed_poll, 1-day window over last 7d)', () => {
  it('counts distinct daily endpoints, folding repeat polls from one ip', async () => {
    await db.insert(podcastEvents).values([
      ev('feed_poll', { ipHash: 'x', createdAt: now }),
      ev('feed_poll', { ipHash: 'x', createdAt: now - 60 }), // same ip, same day → folds
      ev('feed_poll', { ipHash: 'y', createdAt: now }),
    ]);
    const summary = await getPodcastSummary(30);
    expect(summary.subscriberEstimate).toBe(2);
    expect(summary.subscriberWindowDays).toBe(7);
  });
});

describe('getPodcastClients (UA classification)', () => {
  it('classifies feed-poll user agents into client names', async () => {
    await db.insert(podcastEvents).values([
      ev('feed_poll', { ipHash: 'x', userAgent: 'Overcast/3.0 (+http://overcast.fm/)', createdAt: now }),
      ev('feed_poll', { ipHash: 'y', userAgent: 'AppleCoreMedia/1.0 Apple Podcasts/1.0', createdAt: now }),
      ev('feed_poll', { ipHash: 'z', userAgent: 'Spotify/8.0', createdAt: now }),
    ]);
    const clients = await getPodcastClients(10);
    const byType = Object.fromEntries(clients.map((c) => [c.type, c.count]));
    expect(byType['Overcast']).toBe(1);
    expect(byType['Apple Podcasts']).toBe(1);
    expect(byType['Spotify']).toBe(1);
  });
});

describe('getEpisodeDownloadTable', () => {
  it('lists every episode (download or not) with deduped totals and a fixed-length trend', async () => {
    await db.insert(podcastEvents).values([
      ev('download', { episodeId: 'ep1', ipHash: 'a', createdAt: now }),
    ]);
    const table = await getEpisodeDownloadTable(14);
    expect(table).toHaveLength(2); // both episodes listed even though ep2 has no downloads
    const ep1 = table.find((e) => e.id === 'ep1')!;
    const ep2 = table.find((e) => e.id === 'ep2')!;
    expect(ep1.downloads).toBe(1);
    expect(ep2.downloads).toBe(0);
    expect(ep1.trend).toHaveLength(14);
    expect(ep1.trend.reduce((a, b) => a + b, 0)).toBe(1); // the one download lands in the recent window
  });
});
