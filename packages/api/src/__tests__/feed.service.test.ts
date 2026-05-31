import { describe, it, expect, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import { createPodcast } from '../services/podcast.service.js';
import { createEpisode, publishEpisode } from '../services/episode.service.js';
import { buildPodcastFeedXml } from '../services/feed.service.js';

beforeEach(resetNewTables);

describe('RSS feed builder', () => {
  it('feed starts with <?xml and contains required iTunes channel elements', async () => {
    const show = await createPodcast({
      title: 'Test Podcast',
      ownerEmail: 'host@example.com',
      ownerName: 'Host Name',
      description: 'A test podcast',
    });
    const xml = buildPodcastFeedXml(show, [], 'https://example.com');
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<itunes:owner>');
    expect(xml).toContain('<itunes:email>');
  });

  it('feed contains exactly one <item> for published episode, excludes draft', async () => {
    const show = await createPodcast({ title: 'Show for Items' });
    const draft = await createEpisode(show.id, {
      title: 'Draft Episode',
      audioUrl: '/uploads/draft.mp3',
      audioSize: 1000,
      duration: 300,
    });
    const pubEp = await createEpisode(show.id, {
      title: 'Published Episode & Special',
      audioUrl: '/uploads/pub.mp3',
      audioSize: 2000,
      duration: 600,
    });
    const published = await publishEpisode(pubEp.id);

    const episodes = [
      { ...draft },
      { ...published! },
    ];

    const xml = buildPodcastFeedXml(show, episodes, 'https://example.com');

    // Exactly one <item>
    const itemMatches = xml.match(/<item>/g);
    expect(itemMatches?.length).toBe(1);

    // Title with & is escaped
    expect(xml).not.toContain('Published Episode & Special');
    expect(xml).toContain('Published Episode &amp; Special');

    // No raw & from title (it's escaped as &amp;)
    expect(xml).not.toContain('Episode & Special');
  });

  it('published episode item has enclosure and itunes:duration', async () => {
    const show = await createPodcast({ title: 'Enclosure Show' });
    const ep = await createEpisode(show.id, {
      title: 'Audio Episode',
      audioUrl: '/uploads/audio.mp3',
      audioSize: 5000000,
      duration: 1800,
    });
    const published = await publishEpisode(ep.id);

    const xml = buildPodcastFeedXml(show, [published!], 'https://example.com');

    expect(xml).toContain('<enclosure');
    expect(xml).toContain('type=');
    expect(xml).toContain('length=');
    expect(xml).toContain('<itunes:duration>');
  });

  it('CDATA safety: showNotes containing ]]> does not break CDATA section', async () => {
    const show = await createPodcast({ title: 'CDATA Show' });
    const ep = await createEpisode(show.id, {
      title: 'CDATA Episode',
      audioUrl: '/uploads/cdata.mp3',
      showNotes: 'code: `a]]>b` end',
    });
    const published = await publishEpisode(ep.id);

    const xml = buildPodcastFeedXml(show, [published!], 'https://example.com');

    // Must not contain a bare ]]> that terminates CDATA early
    // The ]]> in content must be neutralized as ]]]]><![CDATA[>
    expect(xml).toContain(']]]]><![CDATA[>');

    // CDATA sections must be balanced: count opens and closes
    const cdataOpens = (xml.match(/<!\[CDATA\[/g) || []).length;
    const cdataCloses = (xml.match(/]]>/g) || []).length;
    expect(cdataOpens).toBe(cdataCloses);
  });
});
