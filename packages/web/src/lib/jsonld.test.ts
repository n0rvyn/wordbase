import { describe, it, expect } from 'vitest';

import {
  buildBlogPostingLd,
  buildSoftwareApplicationLd,
  buildPodcastLd,
  buildPodcastEpisodeLd,
  buildWebSiteLd,
  buildOrganizationLd,
  buildBreadcrumbLd,
} from './jsonld.js';
import type { Post, App, Podcast, Episode } from './api.js';

const SITE = 'https://norvyn.com';
const ID = {
  name: 'norvyn',
  description: '独立开发者，做 App、写字、录播客。',
  author: 'norvyn',
  email: 'norvyn@norvyn.com',
  github: 'https://github.com/n0rvyn',
};

// Minimal fixture matching Post shape — only the fields the builder touches.
function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    slug: 'hello-world',
    title: 'Hello World',
    content: '# hello\n\nbody',
    excerpt: 'a short excerpt',
    coverImage: null,
    status: 'published',
    shareToken: null,
    publishedAt: 1_700_000_000, // 2023-11-14T22:13:20Z
    createdAt: 1_700_000_000,
    updatedAt: 1_700_086_400,
    meta: null,
    ...overrides,
  };
}

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: 'a1',
    slug: 'super-note',
    name: 'Super Note',
    tagline: 'tagline',
    icon: null,
    description: 'desc',
    appStoreUrl: 'https://apps.apple.com/app/id123',
    appStoreId: '123',
    bundleId: null,
    platform: 'iOS',
    price: '$0',
    rating: null,
    ratingCount: null,
    accentColor: null,
    features: null,
    screenshots: null,
    links: null,
    status: 'published',
    sortOrder: null,
    publishedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    meta: null,
    category: 'Productivity',
    version: '1.0',
    releaseDate: 1_700_000_000,
    currentVersionReleaseDate: 1_700_000_000,
    minimumOsVersion: '16.0',
    subtitle: null,
    whatsNew: null,
    featured: 0,
    lastSyncedAt: null,
    ...overrides,
  };
}

function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    id: 'pc1',
    slug: 'shi-yu-guang',
    title: '拾余光',
    description: 'A slow-paced show.',
    coverImage: 'https://norvyn.com/cover.png',
    author: 'norvyn',
    ownerName: 'norvyn',
    ownerEmail: 'norvyn@norvyn.com',
    language: 'zh-CN',
    category: 'Technology',
    explicit: 0,
    link: null,
    appleUrl: null,
    spotifyUrl: null,
    copyright: null,
    status: 'published',
    sortOrder: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    meta: null,
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'e1',
    podcastId: 'pc1',
    slug: 'ep-1',
    guid: 'guid-1',
    title: 'EP.1 First',
    summary: 'episode summary',
    showNotes: null,
    transcript: null,
    audioUrl: 'https://norvyn.com/audio/ep-1.mp3',
    audioType: 'audio/mpeg',
    audioSize: 12345,
    duration: 1800,
    coverImage: null,
    episodeNumber: 1,
    seasonNumber: 1,
    episodeType: 'full',
    explicit: 0,
    status: 'published',
    publishedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

describe('buildBlogPostingLd', () => {
  it('emits BlogPosting with headline, dates, author, mainEntityOfPage', () => {
    const post = makePost();
    const ld = buildBlogPostingLd(post, SITE, ID.author);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline).toBe(post.title);
    expect(ld.datePublished).toBe(new Date(post.publishedAt! * 1000).toISOString());
    expect(ld.dateModified).toBe(new Date(post.updatedAt * 1000).toISOString());
    expect(ld.author).toEqual({ '@type': 'Person', name: 'norvyn' });
    expect(ld.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': `${SITE}/posts/${post.slug}`,
    });
    expect(ld.url).toBe(`${SITE}/posts/${post.slug}`);
  });

  it('omits image when coverImage is null', () => {
    const ld = buildBlogPostingLd(makePost({ coverImage: null }), SITE, ID.author);
    expect('image' in ld).toBe(false);
  });

  it('includes image when coverImage is present', () => {
    const ld = buildBlogPostingLd(
      makePost({ coverImage: 'https://norvyn.com/cover.png' }),
      SITE,
      ID.author,
    );
    expect(ld.image).toBe('https://norvyn.com/cover.png');
  });
});

describe('buildSoftwareApplicationLd', () => {
  it('emits SoftwareApplication with name and category', () => {
    const ld = buildSoftwareApplicationLd(makeApp(), SITE);
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld.name).toBe('Super Note');
    expect(ld.applicationCategory).toBe('Productivity');
  });

  it('includes aggregateRating when rating present', () => {
    const ld = buildSoftwareApplicationLd(
      makeApp({ rating: 4.6, ratingCount: 250 }),
      SITE,
    );
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.6,
      ratingCount: 250,
    });
  });

  it('omits aggregateRating when rating absent', () => {
    const ld = buildSoftwareApplicationLd(makeApp({ rating: null }), SITE);
    expect('aggregateRating' in ld).toBe(false);
  });
});

describe('buildPodcastLd', () => {
  it('emits PodcastSeries and maps published episodes to PodcastEpisode', () => {
    const ld = buildPodcastLd(
      makePodcast(),
      [
        makeEpisode({ slug: 'ep-1', title: 'EP.1' }),
        makeEpisode({ id: 'e2', slug: 'ep-2', title: 'EP.2', episodeNumber: 2 }),
      ],
      SITE,
    );
    expect(ld['@type']).toBe('PodcastSeries');
    expect(Array.isArray(ld.episode)).toBe(true);
    expect(ld.episode).toHaveLength(2);
    expect(ld.episode[0]['@type']).toBe('PodcastEpisode');
    expect(ld.episode[0].name).toBe('EP.1');
  });
});

describe('buildPodcastEpisodeLd', () => {
  it('emits a standalone PodcastEpisode whose url is the per-episode page', () => {
    const ld = buildPodcastEpisodeLd(makePodcast(), makeEpisode({ slug: 'ep-7' }), SITE);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('PodcastEpisode');
    expect(ld.url).toBe(`${SITE}/podcast/ep-7`);
    expect(ld.datePublished).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(ld.associatedMedia.contentUrl).toBe('https://norvyn.com/audio/ep-1.mp3');
    expect(ld.partOfSeries).toEqual({
      '@type': 'PodcastSeries',
      name: '拾余光',
      url: `${SITE}/podcast`,
    });
  });

  it('falls back to the show cover when the episode has no cover', () => {
    const ld = buildPodcastEpisodeLd(
      makePodcast({ coverImage: 'https://norvyn.com/show.png' }),
      makeEpisode({ coverImage: null }),
      SITE,
    );
    expect(ld.image).toBe('https://norvyn.com/show.png');
  });

  it('prefers the episode cover over the show cover', () => {
    const ld = buildPodcastEpisodeLd(
      makePodcast({ coverImage: 'https://norvyn.com/show.png' }),
      makeEpisode({ coverImage: 'https://norvyn.com/ep.png' }),
      SITE,
    );
    expect(ld.image).toBe('https://norvyn.com/ep.png');
  });
});

describe('buildWebSiteLd / buildOrganizationLd', () => {
  it('WebSite has @type WebSite and url=site', () => {
    const ld = buildWebSiteLd(SITE, ID);
    expect(ld['@type']).toBe('WebSite');
    expect(ld.url).toBe(SITE);
  });

  it('Organization has name=norvyn, sameAs includes GitHub, url=site', () => {
    const ld = buildOrganizationLd(SITE, ID);
    expect(ld['@type']).toBe('Organization');
    expect(ld.name).toBe(ID.name);
    expect(ld.url).toBe(SITE);
    expect(Array.isArray(ld.sameAs)).toBe(true);
    expect(ld.sameAs).toContain(ID.github);
  });
});

describe('buildBreadcrumbLd', () => {
  it('emits BreadcrumbList with positions in order', () => {
    const ld = buildBreadcrumbLd([
      { name: 'Writing', url: `${SITE}/writing` },
      { name: 'Hello', url: `${SITE}/posts/hello` },
    ]);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Writing',
      item: `${SITE}/writing`,
    });
    expect(ld.itemListElement[1].position).toBe(2);
    expect(ld.itemListElement[1].name).toBe('Hello');
  });
});
