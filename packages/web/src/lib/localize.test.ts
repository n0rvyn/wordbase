import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRendition, type Post, type Page, type App } from './api';
import { localizePost, localizePage, localizeApp } from './localize';

// API_URL is hardcoded to http://localhost:4100 in lib/api.ts; we stub
// globalThis.fetch to intercept the request and exercise the fall-back paths.
const POST: Post = {
  id: 'p1', slug: 'p1', title: '中文标题', content: '# 中文\n\n正文',
  excerpt: null, coverImage: null, status: 'published', shareToken: null,
  publishedAt: 1, createdAt: 1, updatedAt: 1, meta: null,
};
const PAGE: Page = {
  id: 'pg1', slug: 'pg1', title: '页面中文', content: '# P\n\nbody',
  sortOrder: 0, status: 'published', meta: null, createdAt: 1, updatedAt: 1,
};
const APP: App = {
  id: 'a1', slug: 'a1', name: 'MyApp', tagline: '中文 tagline', icon: null,
  description: null, appStoreUrl: null, appStoreId: null, bundleId: null,
  platform: 'iOS', price: null, rating: null, ratingCount: null,
  accentColor: null, features: JSON.stringify([{ icon: '✦', title: '特性 1', blurb: '描述 1' }]),
  screenshots: null, links: null, status: 'published', sortOrder: 0,
  publishedAt: 1, createdAt: 1, updatedAt: 1, meta: null, category: null,
  version: null, releaseDate: null, currentVersionReleaseDate: null,
  minimumOsVersion: null, subtitle: null, whatsNew: null, featured: 0,
  lastSyncedAt: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRendition — non-200 returns null (caller falls back)', () => {
  it('404 → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const r = await getRendition('post', POST.id, 'title', 'en');
    expect(r).toBeNull();
  });

  it('network throw → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await getRendition('post', POST.id, 'content', 'en');
    expect(r).toBeNull();
  });

  it('200 with non-string value → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: 42 }) }));
    const r = await getRendition('post', POST.id, 'title', 'en');
    expect(r).toBeNull();
  });

  it('200 with string value → returns it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: '[en] title' }) }));
    const r = await getRendition('post', POST.id, 'title', 'en');
    expect(r).toBe('[en] title');
  });
});

describe('localizePost / localizePage — lang short-circuit and fall-back', () => {
  it("localizePost with lang='zh' returns the source unchanged (no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await localizePost(POST, 'zh');
    expect(out).toBe(POST);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("localizePage with lang='zh' returns the source unchanged (no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await localizePage(PAGE, 'zh');
    expect(out).toBe(PAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('localizePost with lang=en on fetch failure keeps the source text (build must not break)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const out = await localizePost(POST, 'en');
    expect(out.title).toBe(POST.title);
    expect(out.content).toBe(POST.content);
  });

  it('localizePost with lang=en on a 200 response uses the en title and content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string) => ({
      ok: true, status: 200,
      json: async () => ({ value: '[en]' }),
    })));
    const out = await localizePost(POST, 'en');
    expect(out.title).toBe('[en]');
    expect(out.content).toBe('[en]');
  });
});

describe('localizeApp — tagline + features', () => {
  it("lang='zh' short-circuits (no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await localizeApp(APP, 'zh');
    expect(out).toBe(APP);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lang=en on fetch failure keeps source tagline and features', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const out = await localizeApp(APP, 'en');
    expect(out.tagline).toBe(APP.tagline);
    expect(out.features).toBe(APP.features);
  });

  it('lang=en merges localized tagline and per-feature title/blurb', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const isFeatures = url.includes('field=features');
      return {
        ok: true, status: 200,
        json: async () => isFeatures
          ? { value: JSON.stringify([{ title: '[en] feat', blurb: '[en] blurb' }]) }
          : { value: '[en] tagline' },
      };
    }));
    const out = await localizeApp(APP, 'en');
    expect(out.tagline).toBe('[en] tagline');
    const parsed = JSON.parse(out.features!);
    expect(parsed[0].title).toBe('[en] feat');
    expect(parsed[0].blurb).toBe('[en] blurb');
    expect(parsed[0].icon).toBe('✦');  // icon preserved
  });
});
