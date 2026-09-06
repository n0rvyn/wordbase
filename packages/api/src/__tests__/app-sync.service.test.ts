import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';
import { nanoid } from 'nanoid';

// Mock appstore-lookup.service
vi.mock('../services/appstore-lookup.service.js', () => ({
  lookupApp: vi.fn(),
  lookupAppAnyStorefront: vi.fn(),
  lookupEnCopy: vi.fn(),
}));

// Mock asc.service
vi.mock('../services/asc.service.js', () => ({
  isAscConfigured: vi.fn(),
  fetchAppMetadata: vi.fn(),
}));

import { lookupApp, lookupAppAnyStorefront, lookupEnCopy } from '../services/appstore-lookup.service.js';
import { isAscConfigured, fetchAppMetadata } from '../services/asc.service.js';
import { syncApp, syncAllApps, mergeEnCopyIntoMeta } from '../services/app-sync.service.js';

const lookupMock = lookupApp as ReturnType<typeof vi.fn>;
const lookupAnyMock = lookupAppAnyStorefront as ReturnType<typeof vi.fn>;
const lookupEnCopyMock = lookupEnCopy as ReturnType<typeof vi.fn>;
const isAscConfiguredMock = isAscConfigured as ReturnType<typeof vi.fn>;
const fetchAppMetadataMock = fetchAppMetadata as ReturnType<typeof vi.fn>;

let appId: string;

beforeEach(async () => {
  // Reset mocks
  lookupMock.mockReset();
  lookupAnyMock.mockReset();
  // syncApp calls the multi-storefront entry point; keep every existing
  // `lookupMock.mockResolvedValue(meta)` working by wrapping its result the way
  // the real lookupAppAnyStorefront does.
  lookupAnyMock.mockImplementation(async () => {
    const meta = await lookupMock();
    return meta ? { meta, storefront: 'cn' } : null;
  });
  // Default: no English listing, so `meta` stays as the row has it and the
  // pre-existing assertions in this file are untouched by the en overlay.
  lookupEnCopyMock.mockReset();
  lookupEnCopyMock.mockResolvedValue(null);
  isAscConfiguredMock.mockReset();
  fetchAppMetadataMock.mockReset();

  // Clear apps table
  await db.delete(apps);

  // Insert a test app with appStoreId
  appId = nanoid();
  const now = Math.floor(Date.now() / 1000);
  await db.insert(apps).values({
    id: appId,
    slug: 'test-app',
    name: 'Test App',
    appStoreId: '361304891',
    status: 'draft',
    platform: 'iOS',
    createdAt: now,
    updatedAt: now,
    featured: 0,
  });
});

afterEach(async () => {
  await db.delete(apps);
});

describe('syncApp', () => {
  it('rating always comes from iTunes even when ASC is present', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.7,
      ratingCount: 9999,
      category: 'X-itunes',
      version: '1.0',
      releaseDate: 1700000000,
      currentVersionReleaseDate: 1710000000,
      minimumOsVersion: '16.0',
      price: 'Free',
      icon: 'https://icon.example.com/icon.png',
      screenshots: ['https://s1.example.com'],
      description: 'iTunes desc',
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: 'X-asc',
      version: '1.1',
      subtitle: 'Great app subtitle',
      whatsNew: "What's new from ASC",
      description: 'ASC desc',
      screenshots: [],
      platform: 'iOS',
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.rating).toBeCloseTo(4.7);
    expect(row.subtitle).toBe('Great app subtitle');
    expect(row.category).toBe('X-asc');
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row.lastSyncedAt).toBeGreaterThan(0);
  });

  it('category comes from ASC when ASC is configured (ASC-first)', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.0,
      ratingCount: 100,
      category: 'X-itunes',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: 'X-asc',
      version: '2.0',
      subtitle: 'Sub',
      whatsNew: 'New',
      description: null,
      screenshots: ['https://s.example.com'],
      platform: 'iOS',
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.category).toBe('X-asc');
  });

  it('falls back to iTunes category when ASC is not configured', async () => {
    lookupMock.mockResolvedValue({
      rating: 3.5,
      ratingCount: 50,
      category: 'X-itunes',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.category).toBe('X-itunes');
    expect(row.rating).toBeCloseTo(3.5);
  });

  it('does not clear existing subtitle when ASC is not configured', async () => {
    // Pre-set subtitle
    await db.update(apps).set({ subtitle: 'existing subtitle' });

    lookupMock.mockResolvedValue({
      rating: 3.5,
      ratingCount: 50,
      category: 'X-itunes',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.subtitle).toBe('existing subtitle');
  });

  it('falls through to iTunes screenshots when ASC screenshots is empty array', async () => {
    // Task 3 harden: empty ASC screenshots must NOT shadow iTunes screenshots.
    lookupMock.mockResolvedValue({
      rating: 4.5,
      ratingCount: 500,
      category: 'Productivity',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: ['https://it/1.png', 'https://it/2.png'],
      description: 'iTunes desc',
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: null,
      version: '1.0',
      subtitle: 'Sub',
      whatsNew: null,
      description: null,
      screenshots: [], // ASC has no screenshots — must fall through to iTunes
      platform: 'iOS',
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    const stored = JSON.parse(row.screenshots as string) as string[];
    expect(stored).toEqual(['https://it/1.png', 'https://it/2.png']);
  });

  it('uses ASC screenshots when ASC has non-empty screenshots (regression guard)', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.5,
      ratingCount: 500,
      category: 'Productivity',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: ['https://it/1.png', 'https://it/2.png'],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: null,
      version: '1.0',
      subtitle: null,
      whatsNew: null,
      description: null,
      screenshots: ['https://asc/a.png', 'https://asc/b.png', 'https://asc/c.png'],
      platform: 'iOS',
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    const stored = JSON.parse(row.screenshots as string) as string[];
    expect(stored).toEqual(['https://asc/a.png', 'https://asc/b.png', 'https://asc/c.png']);
  });

  it('does not throw when ASC configured but fetchAppMetadata fails', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.2,
      ratingCount: 200,
      category: 'X-itunes',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockRejectedValue(new Error('ASC_NOT_CONFIGURED'));

    await expect(syncApp(appId)).resolves.not.toThrow();
  });

  it('throws or returns error when app has no appStoreId', async () => {
    const noStoreId = nanoid();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(apps).values({
      id: noStoreId,
      slug: 'no-store-id-app',
      name: 'No Store ID',
      appStoreId: null,
      status: 'draft',
      platform: 'iOS',
      createdAt: now,
      updatedAt: now,
      featured: 0,
    });

    await expect(syncApp(noStoreId)).rejects.toThrow();
  });
});

describe('syncAllApps', () => {
  it('returns synced count and empty failed array on success', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.0,
      ratingCount: 100,
      category: 'Productivity',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    const result = await syncAllApps();
    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.failed)).toBe(true);
    expect(result.failed.length).toBe(0);
  });

  it('collects failures without throwing when one app fails', async () => {
    // Insert another app with appStoreId that will cause iTunes to fail
    const failId = nanoid();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(apps).values({
      id: failId,
      slug: 'fail-app',
      name: 'Fail App',
      appStoreId: '999999999',
      status: 'draft',
      platform: 'iOS',
      createdAt: now,
      updatedAt: now,
      featured: 0,
    });

    // First call (test-app: 361304891) resolves, second (999999999) rejects
    lookupMock
      .mockResolvedValueOnce({
        rating: 4.0,
        ratingCount: 100,
        category: 'Productivity',
        version: '1.0',
        releaseDate: null,
        currentVersionReleaseDate: null,
        minimumOsVersion: null,
        price: null,
        icon: null,
        screenshots: [],
        description: null,
        platform: 'iOS',
      })
      .mockRejectedValueOnce(new Error('iTunes fetch failed'));

    isAscConfiguredMock.mockReturnValue(false);

    const result = await syncAllApps();
    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(result.failed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('syncApp platform field', () => {
  it('stores platform=macOS when ASC returns platform=macOS', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.0,
      ratingCount: 100,
      category: 'Developer Tools',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: 'Developer Tools',
      version: '1.0',
      subtitle: null,
      whatsNew: null,
      description: null,
      screenshots: [],
      platform: 'macOS',
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.platform).toBe('macOS');
  });

  it('falls back to iTunes platform=macOS when ASC is not configured', async () => {
    lookupMock.mockResolvedValue({
      rating: 4.0,
      ratingCount: 100,
      category: 'Developer Tools',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'macOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.platform).toBe('macOS');
  });

  it('preserves cur.platform when both ASC and iTunes platform are null', async () => {
    // existing row already has platform: 'iOS' from beforeEach insert
    lookupMock.mockResolvedValue({
      rating: 4.0,
      ratingCount: 100,
      category: 'Productivity',
      version: '1.0',
      releaseDate: null,
      currentVersionReleaseDate: null,
      minimumOsVersion: null,
      price: null,
      icon: null,
      screenshots: [],
      description: null,
      platform: 'iOS', // not macOS — must not overwrite
    });
    isAscConfiguredMock.mockReturnValue(true);
    fetchAppMetadataMock.mockResolvedValue({
      category: null,
      version: null,
      subtitle: null,
      whatsNew: null,
      description: null,
      screenshots: [],
      platform: null,
    });

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.platform).toBe('iOS');
  });
  // ─── name / appStoreUrl ────────────────────────────────────────────────────
  // Before these were synced, `name` was written once by discoverApps and never
  // refreshed (5 of 7 published rows had drifted from the store by 2026-09-06),
  // and `appStoreUrl` was never written at all, so every consumer gated on it
  // was a dead branch.

  it('refreshes name from the store on every sync', async () => {
    lookupMock.mockResolvedValue({
      name: 'Cashie 记账 - AI拍照语音自动记账本',
      appStoreUrl: 'https://apps.apple.com/cn/app/id6757636100',
      rating: null, ratingCount: null, category: null, version: null,
      releaseDate: null, currentVersionReleaseDate: null, minimumOsVersion: null,
      price: null, icon: null, screenshots: [], description: null, platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    const change = await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.name).toBe('Cashie 记账 - AI拍照语音自动记账本');
    expect(row.appStoreUrl).toBe('https://apps.apple.com/cn/app/id6757636100');
    expect(change.fields).toContain('name');
    expect(change.fields).toContain('appStoreUrl');
  });

  it('keeps the current name when iTunes has no result for the app', async () => {
    // Claudex: on no storefront at all — every lookup comes back empty.
    lookupMock.mockResolvedValue(null);
    isAscConfiguredMock.mockReturnValue(false);

    const change = await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.name).toBe('Test App');
    expect(row.appStoreUrl).toBeNull();
    expect(change.fields).not.toContain('name');
    expect(change.fields).not.toContain('appStoreUrl');
  });

  it('does not report name as changed when the store name already matches', async () => {
    lookupMock.mockResolvedValue({
      name: 'Test App',
      appStoreUrl: null,
      rating: null, ratingCount: null, category: null, version: null,
      releaseDate: null, currentVersionReleaseDate: null, minimumOsVersion: null,
      price: null, icon: null, screenshots: [], description: null, platform: 'iOS',
    });
    isAscConfiguredMock.mockReturnValue(false);

    const change = await syncApp(appId);

    expect(change.fields).not.toContain('name');
  });

  it('reports which storefront answered, and null when none did', async () => {
    lookupAnyMock.mockResolvedValueOnce({
      meta: {
        name: null, appStoreUrl: null, rating: null, ratingCount: null,
        category: null, version: null, releaseDate: null,
        currentVersionReleaseDate: null, minimumOsVersion: null,
        price: null, icon: null, screenshots: [], description: null, platform: 'iOS',
      },
      storefront: 'us',
    });
    isAscConfiguredMock.mockReturnValue(false);
    expect((await syncApp(appId)).storefront).toBe('us');

    lookupAnyMock.mockResolvedValueOnce(null);
    expect((await syncApp(appId)).storefront).toBeNull();
  });
});

// ─── English storefront copy ─────────────────────────────────────────────────
// Verbatim measurement 2026-09-06: id 6760798981 is `佳同步 - 国区国际版活动记录互传`
// on cn and `Glink: Workout & Activity Sync` on us — a different product name,
// not a translation. These fixtures use that real pair.

const GLINK_EN = {
  name: 'Glink: Workout & Activity Sync',
  description: 'Sync workouts between regional accounts.',
  price: 'Free',
  whatsNew: 'Bug fixes.',
};

describe('mergeEnCopyIntoMeta', () => {
  it('writes i18n.en into a row that had no meta at all', () => {
    const out = mergeEnCopyIntoMeta(null, GLINK_EN);
    expect(JSON.parse(out!)).toEqual({ i18n: { en: GLINK_EN } });
  });

  it('preserves unrelated meta keys', () => {
    const out = mergeEnCopyIntoMeta('{"appId":"abc","note":"hand-written"}', GLINK_EN);
    expect(JSON.parse(out!)).toEqual({
      appId: 'abc',
      note: 'hand-written',
      i18n: { en: GLINK_EN },
    });
  });

  it('preserves other locales under i18n', () => {
    const out = mergeEnCopyIntoMeta('{"i18n":{"ja":{"name":"ジェイ"}}}', GLINK_EN);
    expect(JSON.parse(out!)).toEqual({
      i18n: { ja: { name: 'ジェイ' }, en: GLINK_EN },
    });
  });

  it('removes only i18n.en when the app is no longer on the English store', () => {
    const out = mergeEnCopyIntoMeta(
      JSON.stringify({ appId: 'abc', i18n: { en: GLINK_EN, ja: { name: 'ジェイ' } } }),
      null,
    );
    expect(JSON.parse(out!)).toEqual({ appId: 'abc', i18n: { ja: { name: 'ジェイ' } } });
  });

  it('returns null rather than "{}" when nothing is left', () => {
    // Storing "{}" would make `meta` differ from null on every future sync and
    // report a phantom change, which drives a pointless site rebuild.
    expect(mergeEnCopyIntoMeta(JSON.stringify({ i18n: { en: GLINK_EN } }), null)).toBeNull();
    expect(mergeEnCopyIntoMeta(null, null)).toBeNull();
  });

  it('treats unparseable or non-object meta as absent instead of throwing', () => {
    expect(JSON.parse(mergeEnCopyIntoMeta('not json{', GLINK_EN)!)).toEqual({ i18n: { en: GLINK_EN } });
    expect(JSON.parse(mergeEnCopyIntoMeta('[1,2,3]', GLINK_EN)!)).toEqual({ i18n: { en: GLINK_EN } });
    expect(JSON.parse(mergeEnCopyIntoMeta('{"i18n":"oops"}', GLINK_EN)!)).toEqual({ i18n: { en: GLINK_EN } });
  });
});

describe('syncApp — English storefront copy', () => {
  const cnMeta = {
    name: '佳同步 - 国区国际版活动记录互传',
    appStoreUrl: 'https://apps.apple.com/cn/app/id6760798981',
    rating: null, ratingCount: null, category: null, version: null,
    releaseDate: null, currentVersionReleaseDate: null, minimumOsVersion: null,
    price: '免费', icon: null, screenshots: [], description: '在国区与国际版账号之间同步。',
    releaseNotes: '修复问题。', platform: 'iOS',
  };

  it('stores the English listing at meta.i18n.en and reports meta as changed', async () => {
    lookupMock.mockResolvedValue(cnMeta);
    lookupEnCopyMock.mockResolvedValue(GLINK_EN);
    isAscConfiguredMock.mockReturnValue(false);

    const change = await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    // The row itself keeps the Chinese listing — that is what zh pages show.
    expect(row.name).toBe('佳同步 - 国区国际版活动记录互传');
    expect(row.price).toBe('免费');
    // …and /en reads the English one off meta.
    expect(JSON.parse(row.meta!).i18n.en).toEqual(GLINK_EN);
    expect(change.fields).toContain('meta');
  });

  it('asks the English store only about apps that are listed, and tells it which storefront already answered', async () => {
    lookupMock.mockResolvedValue(cnMeta);
    lookupEnCopyMock.mockResolvedValue(GLINK_EN);
    isAscConfiguredMock.mockReturnValue(false);

    await syncApp(appId);

    expect(lookupEnCopyMock).toHaveBeenCalledWith('361304891', 'cn');
  });

  it('leaves an existing overlay alone when no storefront lists the app', async () => {
    // A row that carries an overlay from an earlier sync.
    await db.update(apps)
      .set({ meta: JSON.stringify({ i18n: { en: GLINK_EN } }) })
      .where(eq(apps.id, appId));

    lookupMock.mockResolvedValue(null);   // on no storefront
    isAscConfiguredMock.mockReturnValue(false);

    const change = await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    // Same rule as every other field here: a lookup that found nothing never
    // wipes what the row already has.
    expect(JSON.parse(row.meta!).i18n.en).toEqual(GLINK_EN);
    expect(change.fields).not.toContain('meta');
    expect(lookupEnCopyMock).not.toHaveBeenCalled();
  });

  it('drops the overlay when the app is listed but no longer on the English store', async () => {
    await db.update(apps)
      .set({ meta: JSON.stringify({ i18n: { en: GLINK_EN } }) })
      .where(eq(apps.id, appId));

    lookupMock.mockResolvedValue(cnMeta);
    lookupEnCopyMock.mockResolvedValue(null);
    isAscConfiguredMock.mockReturnValue(false);

    await syncApp(appId);

    const [row] = await db.select().from(apps).where(eq(apps.id, appId));
    expect(row.meta).toBeNull();
  });
});
