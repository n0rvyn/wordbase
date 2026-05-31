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

  const channelLines: string[] = [
    `    <title>${xmlEscape(show.title)}</title>`,
    `    <description>${cdataWrap(show.description)}</description>`,
    `    <language>${xmlEscape(show.language)}</language>`,
    `    <link>${xmlEscape(showLink)}</link>`,
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

    const item: string[] = [
      `    <item>`,
      `      <title>${xmlEscape(ep.title)}</title>`,
      `      <guid isPermaLink="false">${xmlEscape(ep.guid)}</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <description>${cdataWrap(ep.showNotes || ep.summary)}</description>`,
      `      <enclosure url="${xmlEscape(audioUrl)}" type="${xmlEscape(ep.audioType)}" length="${ep.audioSize}" />`,
    ];

    if (ep.duration != null) {
      item.push(`      <itunes:duration>${ep.duration}</itunes:duration>`);
    }

    if (ep.episodeNumber != null) {
      item.push(`      <itunes:episode>${ep.episodeNumber}</itunes:episode>`);
    }

    if (ep.seasonNumber != null) {
      item.push(`      <itunes:season>${ep.seasonNumber}</itunes:season>`);
    }

    if (epCoverUrl) {
      item.push(`      <itunes:image href="${xmlEscape(epCoverUrl)}" />`);
    }

    item.push(`    </item>`);
    itemLines.push(item.join('\n'));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `  <channel>`,
    channelLines.join('\n'),
    itemLines.join('\n'),
    `  </channel>`,
    `</rss>`,
  ].join('\n');
}
