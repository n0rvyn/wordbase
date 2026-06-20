import type { Post, App, Podcast, Episode, SiteIdentity } from './api.js';

const iso = (ts: number | null | undefined): string | undefined =>
  ts ? new Date(ts * 1000).toISOString() : undefined;

// Raster logo for publisher/Organization JSON-LD (Google requires an
// ImageObject, not an SVG). Served from public/.
const LOGO_PATH = '/apple-touch-icon.png';
const orgPublisher = (origin: string, id: SiteIdentity) => ({
  '@type': 'Organization',
  name: id.name,
  url: origin,
  logo: { '@type': 'ImageObject', url: `${origin}${LOGO_PATH}` },
});

export function buildBlogPostingLd(
  post: Post,
  origin: string,
  author: string,
  id: SiteIdentity,
  opts: { description?: string; section?: string } = {},
) {
  const url = `${origin}/posts/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: iso(post.publishedAt),
    dateModified: iso(post.updatedAt),
    author: { '@type': 'Person', name: author },
    publisher: orgPublisher(origin, id),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.section ? { articleSection: opts.section } : {}),
    ...(post.coverImage ? { image: post.coverImage } : {}),
  };
}

export function buildSoftwareApplicationLd(app: App, origin: string) {
  const url = `${origin}/apps/${app.slug}`;
  const base = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.name,
    url,
    ...(app.tagline ? { description: app.tagline } : {}),
    ...(app.icon ? { image: app.icon } : {}),
    ...(app.category ? { applicationCategory: app.category } : {}),
    ...(app.platform ? { operatingSystem: app.platform } : {}),
    ...(app.appStoreUrl ? { downloadUrl: app.appStoreUrl } : {}),
  };
  // Only emit aggregateRating when there is a real rating: a ratingValue of 0
  // with ratingCount 0 is invalid structured data and trips Google's validator.
  const hasRating = app.rating != null && app.rating > 0 && (app.ratingCount ?? 0) > 0;
  const withRating =
    hasRating
      ? {
          ...base,
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: app.rating,
            ratingCount: app.ratingCount ?? 0,
          },
        }
      : base;
  return withRating as typeof base & {
    aggregateRating?: { '@type': string; ratingValue: number; ratingCount: number };
  };
}

export function buildPodcastLd(show: Podcast, episodes: Episode[], origin: string) {
  const url = `${origin}/podcast`;
  const published = episodes.filter((ep) => ep.status === 'published');
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    name: show.title,
    url,
    ...(show.description ? { description: show.description } : {}),
    ...(show.coverImage ? { image: show.coverImage } : {}),
    ...(show.author ? { author: { '@type': 'Person', name: show.author } } : {}),
    ...(show.language ? { inLanguage: show.language } : {}),
    episode: published.map((ep) => ({
      '@type': 'PodcastEpisode',
      name: ep.title,
      url: `${url}/${ep.slug}`,
      ...(ep.summary ? { description: ep.summary } : {}),
      ...(ep.publishedAt ? { datePublished: iso(ep.publishedAt) } : {}),
      ...(ep.episodeNumber != null ? { episodeNumber: ep.episodeNumber } : {}),
      ...(ep.seasonNumber != null ? { seasonNumber: ep.seasonNumber } : {}),
      ...(ep.duration != null ? { duration: ep.duration } : {}),
      partOfSeries: { '@type': 'PodcastSeries', name: show.title, url },
      associatedMedia: {
        '@type': 'MediaObject',
        contentUrl: ep.audioUrl,
        ...(ep.audioType ? { encodingFormat: ep.audioType } : {}),
      },
    })),
  };
}

/**
 * Standalone PodcastEpisode LD for a single-episode page (/podcast/<slug>).
 * Distinct from the embedded episodes inside buildPodcastLd's PodcastSeries:
 * this is the page's own primary entity, with a partOfSeries back-reference.
 */
export function buildPodcastEpisodeLd(show: Podcast, ep: Episode, origin: string) {
  const seriesUrl = `${origin}/podcast`;
  const url = `${seriesUrl}/${ep.slug}`;
  const image = ep.coverImage ?? show.coverImage;
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: ep.title,
    url,
    ...(ep.summary ? { description: ep.summary } : {}),
    ...(ep.publishedAt ? { datePublished: iso(ep.publishedAt) } : {}),
    ...(ep.episodeNumber != null ? { episodeNumber: ep.episodeNumber } : {}),
    ...(ep.seasonNumber != null ? { seasonNumber: ep.seasonNumber } : {}),
    ...(ep.duration != null ? { duration: ep.duration } : {}),
    ...(image ? { image } : {}),
    associatedMedia: {
      '@type': 'MediaObject',
      contentUrl: ep.audioUrl,
      ...(ep.audioType ? { encodingFormat: ep.audioType } : {}),
    },
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: show.title,
      url: seriesUrl,
    },
  };
}

export function buildWebSiteLd(origin: string, id: SiteIdentity) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: id.name,
    url: origin,
    // Enables Google's sitelinks search box pointing at the on-site /search page.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildOrganizationLd(origin: string, id: SiteIdentity) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: id.name,
    url: origin,
    logo: { '@type': 'ImageObject', url: `${origin}${LOGO_PATH}` },
    sameAs: [id.github],
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
