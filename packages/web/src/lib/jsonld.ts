import type { Post, App, Podcast, Episode, SiteIdentity } from './api.js';

const iso = (ts: number | null | undefined): string | undefined =>
  ts ? new Date(ts * 1000).toISOString() : undefined;

export function buildBlogPostingLd(post: Post, origin: string, author: string) {
  const url = `${origin}/posts/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: iso(post.publishedAt),
    dateModified: iso(post.updatedAt),
    author: { '@type': 'Person', name: author },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(post.coverImage ? { image: post.coverImage } : {}),
  } as {
    '@context': string;
    '@type': string;
    headline: string;
    datePublished: string | undefined;
    dateModified: string | undefined;
    author: { '@type': string; name: string };
    mainEntityOfPage: { '@type': string; '@id': string };
    url: string;
    image?: string;
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
  const withRating =
    app.rating != null
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
      url: `${url}#ep-${ep.slug}`,
      ...(ep.summary ? { description: ep.summary } : {}),
      ...(ep.publishedAt ? { datePublished: iso(ep.publishedAt) } : {}),
      ...(ep.episodeNumber != null ? { episodeNumber: ep.episodeNumber } : {}),
      ...(ep.seasonNumber != null ? { seasonNumber: ep.seasonNumber } : {}),
      ...(ep.duration != null ? { duration: ep.duration } : {}),
      associatedMedia: {
        '@type': 'MediaObject',
        contentUrl: ep.audioUrl,
        ...(ep.audioType ? { encodingFormat: ep.audioType } : {}),
      },
    })),
  };
}

export function buildWebSiteLd(origin: string, id: SiteIdentity) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: id.name,
    url: origin,
  };
}

export function buildOrganizationLd(origin: string, id: SiteIdentity) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: id.name,
    url: origin,
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
