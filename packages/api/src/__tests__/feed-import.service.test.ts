import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resetNewTables } from './helpers.js';
import { parseExternalFeed, parseDuration, parsePubDate } from '../services/feed-import.service.js';
import { createPodcast } from '../services/podcast.service.js';
import { upsertEpisodeByExternal, listEpisodes } from '../services/episode.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixtures', 'anchor-feed.xml'), 'utf8');

describe('parseExternalFeed (Anchor/Spotify RSS)', () => {
  it('parses the show metadata', () => {
    const { show } = parseExternalFeed(fixture);
    expect(show.title).toBe('拾余光');
    expect(show.author).toBe('Norvyn');
    expect(show.category).toBe('Technology');
    expect(show.ownerEmail).toBe('norvynzhang@gmail.com');
    expect(show.description && show.description.length).toBeGreaterThan(20);
  });

  it('parses all 16 episodes with normalized fields', () => {
    const { episodes } = parseExternalFeed(fixture);
    expect(episodes.length).toBe(16);
    for (const ep of episodes) {
      expect(ep.guid).toBeTruthy();
      expect(ep.title).toBeTruthy();
      expect(ep.audioUrl).toMatch(/^https?:\/\//);
      expect(typeof ep.episodeNumber).toBe('number');
      expect(typeof ep.duration).toBe('number');
      expect(typeof ep.publishedAt).toBe('number');
    }
    // newest episode is #16 in this feed
    const numbers = episodes.map((e) => e.episodeNumber);
    expect(numbers).toContain(16);
    expect(numbers).toContain(1);
  });

  it('duration parses both integer seconds and H:MM:SS', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });

  it('pubDate parses RFC-822 into epoch seconds', () => {
    const t = parsePubDate('Tue, 02 Jun 2026 12:06:56 GMT');
    expect(t).toBe(Math.floor(Date.parse('Tue, 02 Jun 2026 12:06:56 GMT') / 1000));
    expect(parsePubDate('not a date')).toBeUndefined();
  });
});

describe('feed import is idempotent via upsertEpisodeByExternal', () => {
  beforeEach(resetNewTables);

  it('importing the same feed twice yields 16 rows, not 32', async () => {
    const { show, episodes } = parseExternalFeed(fixture);
    const podcast = await createPodcast({ title: show.title || 'Imported' });

    const importOnce = async () => {
      for (const ep of episodes) {
        await upsertEpisodeByExternal(podcast.id, {
          ...ep,
          externalSource: 'anchor',
          externalId: ep.guid,
          status: 'draft',
        });
      }
    };

    await importOnce();
    await importOnce();

    const { total } = await listEpisodes(podcast.id, { limit: 100 });
    expect(total).toBe(16);
  });
});
