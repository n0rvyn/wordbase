import { XMLParser } from 'fast-xml-parser';

// Parsed shape of an external podcast RSS feed (Apple/Anchor/Spotify-style),
// normalized to the fields WordBase stores. Audio URLs are kept as-is (the
// external CDN); the caller decides whether to rehost.

export interface ParsedShow {
  title?: string;
  description?: string;
  author?: string;
  ownerName?: string;
  ownerEmail?: string;
  category?: string;
  coverImage?: string;
  language?: string;
  copyright?: string;
  explicit?: number;
}

export interface ParsedEpisode {
  guid: string;
  title: string;
  summary?: string;
  showNotes?: string;
  audioUrl: string;
  audioType?: string;
  audioSize?: number;
  duration?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  episodeType?: string;
  explicit?: number;
  publishedAt?: number; // unix epoch seconds
}

export interface ParsedFeed {
  show: ParsedShow;
  episodes: ParsedEpisode[];
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// fast-xml-parser yields a string for simple text nodes, or an object carrying
// attributes (with the text under '#text'). Normalize both to a trimmed string.
function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return text((v as Record<string, unknown>)['#text']);
  }
  return undefined;
}

function attr(v: unknown, name: string): string | undefined {
  if (v && typeof v === 'object' && name in (v as Record<string, unknown>)) {
    const a = (v as Record<string, unknown>)[name];
    return a == null ? undefined : String(a);
  }
  return undefined;
}

function intOrUndef(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

function stripTags(html: string | undefined): string | undefined {
  if (html == null) return undefined;
  const t = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return t || undefined;
}

// itunes:duration is either integer seconds or H:MM:SS / MM:SS.
export function parseDuration(v: unknown): number | undefined {
  const s = text(v);
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parsePubDate(v: unknown): number | undefined {
  const s = text(v);
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

export function parseExternalFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // CDATA is merged into the text value; entities are decoded so escaped HTML in
    // <itunes:summary>/<description> comes back as real markup for show notes.
    processEntities: true,
    trimValues: true,
  });

  const root = parser.parse(xml) as Record<string, any>;
  const channel = root?.rss?.channel ?? {};

  const owner = channel['itunes:owner'];
  const category = asArray(channel['itunes:category'])[0];

  const show: ParsedShow = {
    title: text(channel.title),
    description: text(channel['itunes:summary']) ?? text(channel.description),
    author: text(channel['itunes:author']),
    ownerName: text(owner?.['itunes:name']),
    ownerEmail: text(owner?.['itunes:email']),
    category: attr(category, '@_text'),
    coverImage: attr(channel['itunes:image'], '@_href') ?? text(channel.image?.url),
    language: text(channel.language),
    copyright: text(channel.copyright),
    explicit: /^(true|yes|1)$/i.test(text(channel['itunes:explicit']) ?? '') ? 1 : 0,
  };

  const episodes: ParsedEpisode[] = [];
  for (const item of asArray(channel.item)) {
    const enclosure = item.enclosure;
    const audioUrl = attr(enclosure, '@_url');
    if (!audioUrl) continue; // an item with no audio is not an episode we can host

    const html = text(item['content:encoded']) ?? text(item.description) ?? text(item['itunes:summary']);
    const guid = text(item.guid) ?? audioUrl; // fall back to the enclosure URL as a stable key

    episodes.push({
      guid,
      title: text(item.title) ?? '(untitled)',
      summary: stripTags(text(item['itunes:summary']) ?? html),
      showNotes: html,
      audioUrl,
      audioType: attr(enclosure, '@_type') ?? 'audio/mpeg',
      audioSize: intOrUndef(attr(enclosure, '@_length')),
      duration: parseDuration(item['itunes:duration']),
      episodeNumber: intOrUndef(text(item['itunes:episode'])),
      seasonNumber: intOrUndef(text(item['itunes:season'])),
      episodeType: text(item['itunes:episodeType']),
      explicit: /^(true|yes|1)$/i.test(text(item['itunes:explicit']) ?? '') ? 1 : undefined,
      publishedAt: parsePubDate(item.pubDate),
    });
  }

  return { show, episodes };
}
