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

  it('emits enriched channel + item tags from stored fields', async () => {
    const show = await createPodcast({
      title: 'Rich Show',
      slug: '拾余光',
      description: 'show blurb',
      ownerEmail: 'h@example.com',
      ownerName: 'Host',
    });
    const ep = await createEpisode(show.id, {
      title: 'Rich Episode',
      audioUrl: '/uploads/rich.mp3',
      audioSize: 1234,
      duration: 700,
      summary: 'a short summary',
      showNotes: '<p>full <strong>notes</strong></p>',
      transcript: 'hello transcript',
      episodeType: 'trailer',
      explicit: 1,
      episodeNumber: 3,
      seasonNumber: 1,
    });
    const published = await publishEpisode(ep.id);
    const xml = buildPodcastFeedXml(show, [published!], 'https://example.com');

    // namespaces
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xmlns:podcast="https://podcastindex.org/namespace/1.0"');
    // channel enrichment
    expect(xml).toContain('<itunes:summary>');
    expect(xml).toContain('<itunes:type>episodic</itunes:type>');
    expect(xml).toContain('rel="self"');
    expect(xml).toContain('<lastBuildDate>');
    // CJK slug is percent-encoded in the self href
    expect(xml).toContain('/api/podcasts/%E6%8B%BE%E4%BD%99%E5%85%89/feed.xml');
    // item enrichment
    expect(xml).toContain('<content:encoded>');
    expect(xml).toContain('full <strong>notes</strong>');
    expect(xml).toContain('<itunes:episodeType>trailer</itunes:episodeType>');
    expect(xml).toContain('<itunes:explicit>true</itunes:explicit>');
    expect(xml).toContain('<podcast:transcript');
    expect(xml).toContain('transcript.txt" type="text/plain"');
  });

  it('omits optional item tags when fields are null, and clamps bad episodeType to full', async () => {
    const show = await createPodcast({ title: 'Sparse Show' });
    const ep = await createEpisode(show.id, {
      title: 'Sparse Episode',
      audioUrl: '/uploads/sparse.mp3',
      audioSize: 10,
      episodeType: 'nonsense',
    });
    const published = await publishEpisode(ep.id);
    const xml = buildPodcastFeedXml(show, [published!], 'https://example.com');

    expect(xml).not.toContain('<content:encoded>');
    expect(xml).not.toContain('<podcast:transcript');
    // explicit is null here, so no item-level itunes:explicit (channel still has one)
    expect((xml.match(/<itunes:explicit>/g) || []).length).toBe(1);
    expect(xml).toContain('<itunes:episodeType>full</itunes:episodeType>');
  });
});
