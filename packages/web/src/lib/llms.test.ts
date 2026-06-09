import { describe, it, expect } from 'vitest';

import { buildLlmsTxt } from './llms.js';
import type { Post, App, Podcast } from './api.js';

const ORIGIN = 'https://norvyn.com';
const ID = {
  name: 'norvyn',
  description: '独立开发者，做 App、写字、录播客。',
  author: 'norvyn',
  email: 'norvyn@norvyn.com',
  github: 'https://github.com/n0rvyn',
};

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
    publishedAt: 1_700_000_000,
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

describe('buildLlmsTxt', () => {
  it('starts with # norvyn H1 and site description blockquote', () => {
    const md = buildLlmsTxt({ posts: [], apps: [], podcasts: [] }, ORIGIN, ID);
    // The first non-empty line is the H1 with the site name.
    const firstLine = md.split('\n').find((l) => l.trim().length > 0);
    expect(firstLine).toBe(`# ${ID.name}`);
    // The site description is rendered as a Markdown blockquote.
    expect(md).toMatch(/^> /m);
    // The blockquote contains the SITE_DESCRIPTION value.
    expect(md).toContain(`> ${ID.description}`);
  });

  it('emits ## Writing section with one link per published post', () => {
    const posts = [
      makePost({ id: 'a', slug: 'post-a', title: 'Post A' }),
      makePost({ id: 'b', slug: 'post-b', title: 'Post B' }),
    ];
    const md = buildLlmsTxt({ posts, apps: [], podcasts: [] }, ORIGIN, ID);
    expect(md).toContain('## Writing');
    expect(md).toContain(`- [Post A](${ORIGIN}/posts/post-a)`);
    expect(md).toContain(`- [Post B](${ORIGIN}/posts/post-b)`);
  });

  it('emits ## Apps section with one link per published app', () => {
    const apps = [
      makeApp({ slug: 'super-note', name: 'Super Note' }),
      makeApp({ id: 'a2', slug: 'mini-app', name: 'Mini App' }),
    ];
    const md = buildLlmsTxt({ posts: [], apps, podcasts: [] }, ORIGIN, ID);
    expect(md).toContain('## Apps');
    expect(md).toContain(`- [Super Note](${ORIGIN}/apps/super-note)`);
    expect(md).toContain(`- [Mini App](${ORIGIN}/apps/mini-app)`);
  });

  it('emits ## Podcast section with one link per published podcast', () => {
    const podcasts = [
      makePodcast({ slug: 'shi-yu-guang', title: '拾余光' }),
      makePodcast({ id: 'pc2', slug: 'other-show', title: 'Other Show' }),
    ];
    const md = buildLlmsTxt({ posts: [], apps: [], podcasts }, ORIGIN, ID);
    expect(md).toContain('## Podcast');
    expect(md).toContain(`- [拾余光](${ORIGIN}/podcasts/shi-yu-guang)`);
    expect(md).toContain(`- [Other Show](${ORIGIN}/podcasts/other-show)`);
  });

  it('caps Writing at 30 most-recent posts (newest first)', () => {
    const posts = Array.from({ length: 40 }, (_, i) =>
      makePost({
        id: `p${i}`,
        slug: `post-${i}`,
        title: `Post ${i}`,
        // Newer index → higher publishedAt
        publishedAt: 1_700_000_000 + i * 1000,
      }),
    );
    const md = buildLlmsTxt({ posts, apps: [], podcasts: [] }, ORIGIN, ID);
    // 30 entries, newest 30 indices (10..39)
    const linkMatches = md.match(/^- \[Post \d+\]/gm) ?? [];
    expect(linkMatches).toHaveLength(30);
    // Newest post (index 39) included
    expect(md).toContain('- [Post 39]');
    // Oldest in range (index 10) included
    expect(md).toContain('- [Post 10]');
    // Oldest overall (index 0) dropped
    expect(md).not.toContain('- [Post 0]');
  });

  it('omits empty sections cleanly (still emits their H2 headers)', () => {
    const md = buildLlmsTxt({ posts: [], apps: [], podcasts: [] }, ORIGIN, ID);
    // No content to list — H2 headers may still appear (locked by plan: "空集合的分区被省略或留标题").
    // The contract we lock: H1 + blockquote are present, and the file is valid Markdown
    // (no empty `- ` list lines dangling).
    expect(md).toContain(`# ${ID.name}`);
    expect(md).toMatch(/^> /m);
    // No dangling empty bullets
    expect(md).not.toMatch(/^- $/m);
  });
});
