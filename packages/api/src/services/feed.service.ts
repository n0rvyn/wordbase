import type { Podcast, PodcastEpisode } from '../db/schema.js';

export function xmlEscape(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function cdataWrap(s: string | null | undefined): string {
  if (s == null) return '';
  return `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function absolutizeUrl(url: string | null | undefined, siteUrl: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${siteUrl.replace(/\/$/, '')}${url}`;
}

// Apple's episodeType vocabulary; anything else falls back to "full".
const VALID_EPISODE_TYPES = new Set(['full', 'trailer', 'bonus']);

// The path where an episode's transcript is served as plain text. Shared with the
// transcript route (routes/podcasts.ts) so the feed's <podcast:transcript> href and
// the route can never drift. Percent-encoded for CJK slugs.
export function episodeTranscriptPath(slug: string): string {
  return `/api/podcasts/episodes/${encodeURIComponent(slug)}/transcript.txt`;
}

export function buildPodcastFeedXml(
  show: Podcast,
  episodes: PodcastEpisode[],
  siteUrl: string
): string {
  const site = siteUrl || process.env.SITE_URL || 'https://norvyn.com';

  const publishedEpisodes = episodes
    .filter((ep) => ep.status === 'published' && ep.publishedAt != null)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  const showLink = absolutizeUrl(show.link || `/${show.slug}`, site);
  const coverImageUrl = absolutizeUrl(show.coverImage, site);
  // Self-reference per RSS best practice; encode the slug so CJK feed URLs validate.
  const selfHref = `${site.replace(/\/$/, '')}/api/podcasts/${encodeURIComponent(show.slug)}/feed.xml`;
  // Keep the builder pure: derive lastBuildDate from the newest episode (already
  // sorted desc), falling back to the show's own updatedAt — never Date.now().
  const lastBuildSeconds = publishedEpisodes[0]?.publishedAt ?? show.updatedAt;

  const channelLines: string[] = [
    `    <title>${xmlEscape(show.title)}</title>`,
    `    <description>${cdataWrap(show.description)}</description>`,
    `    <itunes:summary>${cdataWrap(show.description)}</itunes:summary>`,
    `    <language>${xmlEscape(show.language)}</language>`,
    `    <link>${xmlEscape(showLink)}</link>`,
    `    <atom:link href="${xmlEscape(selfHref)}" rel="self" type="application/rss+xml" />`,
    `    <itunes:type>episodic</itunes:type>`,
    `    <lastBuildDate>${new Date(lastBuildSeconds * 1000).toUTCString()}</lastBuildDate>`,
    `    <itunes:author>${xmlEscape(show.author || show.ownerName)}</itunes:author>`,
    `    <itunes:owner>`,
    `      <itunes:name>${xmlEscape(show.ownerName)}</itunes:name>`,
    `      <itunes:email>${xmlEscape(show.ownerEmail)}</itunes:email>`,
    `    </itunes:owner>`,
  ];

  if (coverImageUrl) {
    channelLines.push(`    <itunes:image href="${xmlEscape(coverImageUrl)}" />`);
  }

  if (show.category) {
    channelLines.push(`    <itunes:category text="${xmlEscape(show.category)}" />`);
  }

  channelLines.push(`    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>`);

  if (show.copyright) {
    channelLines.push(`    <copyright>${xmlEscape(show.copyright)}</copyright>`);
  }

  const itemLines: string[] = [];
  for (const ep of publishedEpisodes) {
    const audioUrl = absolutizeUrl(ep.audioUrl, site);
    const pubDate = new Date((ep.publishedAt ?? 0) * 1000).toUTCString();
    const epCoverUrl = absolutizeUrl(ep.coverImage, site);
    // Short text for <description>/<itunes:summary>; full HTML in <content:encoded>.
    const summaryText = ep.summary || ep.showNotes;
    const episodeType = VALID_EPISODE_TYPES.has(ep.episodeType) ? ep.episodeType : 'full';

    const item: string[] = [
      `    <item>`,
      `      <title>${xmlEscape(ep.title)}</title>`,
      `      <guid isPermaLink="false">${xmlEscape(ep.guid)}</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <description>${cdataWrap(summaryText)}</description>`,
      `      <itunes:summary>${cdataWrap(summaryText)}</itunes:summary>`,
      `      <enclosure url="${xmlEscape(audioUrl)}" type="${xmlEscape(ep.audioType)}" length="${ep.audioSize}" />`,
    ];

    if (ep.showNotes) {
      item.push(`      <content:encoded>${cdataWrap(ep.showNotes)}</content:encoded>`);
    }

    if (ep.duration != null) {
      item.push(`      <itunes:duration>${ep.duration}</itunes:duration>`);
    }

    item.push(`      <itunes:episodeType>${episodeType}</itunes:episodeType>`);

    if (ep.episodeNumber != null) {
      item.push(`      <itunes:episode>${ep.episodeNumber}</itunes:episode>`);
    }

    if (ep.seasonNumber != null) {
      item.push(`      <itunes:season>${ep.seasonNumber}</itunes:season>`);
    }

    if (ep.explicit != null) {
      item.push(`      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>`);
    }

    if (epCoverUrl) {
      item.push(`      <itunes:image href="${xmlEscape(epCoverUrl)}" />`);
    }

    if (ep.transcript) {
      const transcriptUrl = absolutizeUrl(episodeTranscriptPath(ep.slug), site);
      item.push(`      <podcast:transcript url="${xmlEscape(transcriptUrl)}" type="text/plain" />`);
    }

    item.push(`    </item>`);
    itemLines.push(item.join('\n'));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">`,
    `  <channel>`,
    channelLines.join('\n'),
    itemLines.join('\n'),
    `  </channel>`,
    `</rss>`,
  ].join('\n');
}
