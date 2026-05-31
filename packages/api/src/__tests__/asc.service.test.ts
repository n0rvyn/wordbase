import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { decodeProtectedHeader, decodeJwt } from 'jose';

// Generate a real EC P-256 key pair for testing
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const testKeyId = 'TESTKEY123';
const testIssuerId = 'test-issuer-id-uuid';

const TEST_APP_ID = '6450476778';
const INFO_ID = 'info-001';
const VER_LOC_ZH_ID = 'verloc-zh-001';
const VER_LOC_EN_ID = 'verloc-en-001';

// appInfos-list fixture: array shape, state READY_FOR_SALE.
// primaryCategory: appCategories token with NO attributes.name (real API behavior per DP-3.5-2).
const mockAppInfosResponse = {
  data: [
    {
      id: INFO_ID,
      type: 'appInfos',
      attributes: {
        appStoreState: 'READY_FOR_SALE',
      },
      relationships: {
        primaryCategory: {
          data: { id: 'PRODUCTIVITY', type: 'appCategories' },
        },
      },
    },
  ],
  included: [
    {
      // Real appCategories token has no attributes.name — forces category=null path (DP-3.5-2).
      id: 'PRODUCTIVITY',
      type: 'appCategories',
      attributes: {
        // No 'name' attribute — intentional: real ASC appCategories has only id token.
      },
    },
  ],
};

// appInfoLocalizations fixture: zh-Hans first (subtitle present), en-US without subtitle.
const mockAppInfoLocalizationsResponse = {
  data: [
    {
      id: 'loc-zh-001',
      type: 'appInfoLocalizations',
      attributes: {
        locale: 'zh-Hans',
        subtitle: '记录点滴，让思想生根发芽。',
      },
    },
    {
      id: 'loc-en-001',
      type: 'appInfoLocalizations',
      attributes: {
        locale: 'en-US',
        // No subtitle — tests zh-Hans-first selection
      },
    },
  ],
};

// appStoreVersions fixture: en-US verLoc listed FIRST so the guard discriminates (G-1).
// The correct code prefers zh-Hans by locale (position-independent); a revert to
// "break on first localization" would pick en-US here → fails the zh-verLocId +
// whatsNew===null assertions below. zh-Hans first would make both guards inert.
const mockVersionsResponse = {
  data: [
    {
      id: 'ver-001',
      type: 'appStoreVersions',
      attributes: {
        versionString: '1.0',
        platform: 'IOS',
      },
      relationships: {
        appStoreVersionLocalizations: {
          data: [
            { id: VER_LOC_EN_ID, type: 'appStoreVersionLocalizations' },
            { id: VER_LOC_ZH_ID, type: 'appStoreVersionLocalizations' },
          ],
        },
      },
    },
  ],
  included: [
    {
      id: VER_LOC_ZH_ID,
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale: 'zh-Hans',
        whatsNew: null,
        description: '一款帮助你认识自己的应用。',
        promotionalText: null,
      },
    },
    {
      id: VER_LOC_EN_ID,
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale: 'en-US',
        whatsNew: 'Bug fixes.',
        description: 'Know yourself.',
        promotionalText: null,
      },
    },
  ],
};

// appScreenshotSets fixture: 2 sets, 3 screenshots total with templateUrl placeholders.
const mockScreenshotSetsResponse = {
  data: [
    {
      id: 'set-001',
      type: 'appScreenshotSets',
      relationships: {
        appScreenshots: {
          data: [
            { id: 'shot-001', type: 'appScreenshots' },
            { id: 'shot-002', type: 'appScreenshots' },
          ],
        },
      },
    },
    {
      id: 'set-002',
      type: 'appScreenshotSets',
      relationships: {
        appScreenshots: {
          data: [
            { id: 'shot-003', type: 'appScreenshots' },
          ],
        },
      },
    },
  ],
  included: [
    {
      id: 'shot-001',
      type: 'appScreenshots',
      attributes: {
        imageAsset: {
          templateUrl: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource001/{w}x{h}bb.{f}',
        },
      },
    },
    {
      id: 'shot-002',
      type: 'appScreenshots',
      attributes: {
        imageAsset: {
          templateUrl: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource002/{w}x{h}bb.{f}',
        },
      },
    },
    {
      id: 'shot-003',
      type: 'appScreenshots',
      attributes: {
        imageAsset: {
          templateUrl: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource003/{w}x{h}bb.{f}',
        },
      },
    },
  ],
};

// URL-routing fetch mock: routes by path fragment, records all fetched URLs for regression guards.
function makeRoutedAscFetch() {
  const fetchedUrls: string[] = [];

  const mockFn = vi.fn().mockImplementation((url: string) => {
    fetchedUrls.push(url);

    if (url.includes('/appStoreVersions')) {
      return Promise.resolve({ ok: true, json: async () => mockVersionsResponse });
    }
    if (url.includes('/appScreenshotSets')) {
      return Promise.resolve({ ok: true, json: async () => mockScreenshotSetsResponse });
    }
    if (url.includes('/appInfoLocalizations')) {
      return Promise.resolve({ ok: true, json: async () => mockAppInfoLocalizationsResponse });
    }
    if (url.includes('/appInfos')) {
      return Promise.resolve({ ok: true, json: async () => mockAppInfosResponse });
    }
    // Default 404-like for unrecognized paths (fail loudly)
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });

  return { mockFn, fetchedUrls };
}

beforeEach(() => {
  process.env.ASC_KEY_ID = testKeyId;
  process.env.ASC_ISSUER_ID = testIssuerId;
  process.env.ASC_PRIVATE_KEY = testPrivateKeyPem;
  delete process.env.ASC_PRIVATE_KEY_PATH;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ASC_KEY_ID;
  delete process.env.ASC_ISSUER_ID;
  delete process.env.ASC_PRIVATE_KEY;
  vi.resetModules();
});

describe('getAscToken', () => {
  it('produces a JWT with alg=ES256 and correct kid', async () => {
    const { mockFn } = makeRoutedAscFetch();
    vi.stubGlobal('fetch', mockFn);
    const { getAscToken } = await import('../services/asc.service.js');
    const token = await getAscToken();
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(testKeyId);
  });

  it('produces a JWT with correct aud, iss, and exp within 1200s', async () => {
    const { mockFn } = makeRoutedAscFetch();
    vi.stubGlobal('fetch', mockFn);
    const { getAscToken } = await import('../services/asc.service.js');
    const token = await getAscToken();
    const payload = decodeJwt(token);
    expect(payload.aud).toBe('appstoreconnect-v1');
    expect(payload.iss).toBe(testIssuerId);
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.iat).toBe('number');
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(1200);
  });
});

describe('fetchAppMetadata', () => {
  it('throws ASC_NOT_CONFIGURED when env vars are missing', async () => {
    delete process.env.ASC_KEY_ID;
    delete process.env.ASC_ISSUER_ID;
    delete process.env.ASC_PRIVATE_KEY;
    const { fetchAppMetadata } = await import('../services/asc.service.js');
    await expect(fetchAppMetadata(TEST_APP_ID)).rejects.toThrow('ASC_NOT_CONFIGURED');
  });

  it('maps ASC response to subtitle, version, whatsNew, category=null, screenshots resolved', async () => {
    const { mockFn, fetchedUrls } = makeRoutedAscFetch();
    vi.stubGlobal('fetch', mockFn);
    const { fetchAppMetadata } = await import('../services/asc.service.js');
    const result = await fetchAppMetadata(TEST_APP_ID);
    expect(result).not.toBeNull();

    // subtitle: zh-Hans preferred
    expect(result!.subtitle).toBe('记录点滴，让思想生根发芽。');

    // version
    expect(result!.version).toBe('1.0');

    // whatsNew: zh-Hans loc has null — expect null (not en-US value)
    expect(result!.whatsNew).toBeNull();

    // category === null: real appCategories token has no attributes.name (DP-3.5-2)
    expect(result!.category).toBeNull();

    // screenshots: 3 resolved URLs, no literal {w}/{h}/{f}
    expect(result!.screenshots).toHaveLength(3);
    for (const url of result!.screenshots) {
      expect(url).not.toContain('{w}');
      expect(url).not.toContain('{h}');
      expect(url).not.toContain('{f}');
      expect(url).toContain('1290x2796bb.png');
    }

    // Regression guard 1: no invalid nested include substring in any fetched URL
    for (const url of fetchedUrls) {
      expect(url).not.toContain('appInfos.appInfoLocalizations');
    }

    // Regression guard 2: correct API paths were called
    expect(fetchedUrls.some(u => u.includes(`/v1/apps/${TEST_APP_ID}/appInfos`))).toBe(true);
    expect(fetchedUrls.some(u => u.includes('/appInfoLocalizations'))).toBe(true);
    expect(fetchedUrls.some(u => u.includes('/appScreenshotSets'))).toBe(true);

    // Regression guard 3 (MR-1): screenshot-sets call used the zh-Hans verLocId deterministically
    expect(fetchedUrls.some(u => u.includes(`/${VER_LOC_ZH_ID}/appScreenshotSets`))).toBe(true);
    expect(fetchedUrls.some(u => u.includes(`/${VER_LOC_EN_ID}/appScreenshotSets`))).toBe(false);
  });
});

describe('listAscApps', () => {
  it('maps GET /v1/apps response to 3-field shape (appStoreId, name, bundleId)', async () => {
    const mockAppsList = {
      data: [
        { id: '111111111', attributes: { name: 'App One', bundleId: 'com.example.one' } },
        { id: '222222222', attributes: { name: 'App Two', bundleId: null } },
        { id: '333333333', attributes: {} }, // no name, no bundleId — name falls back to id
      ],
    };

    // Isolated mock: GET /v1/apps?limit=200 has no path fragment in common with appInfos URLs.
    // The safe discriminator is '/v1/apps?' — the appInfos path is '/v1/apps/<id>/appInfos'.
    const listFetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/v1/apps?')) {
        return Promise.resolve({ ok: true, json: async () => mockAppsList });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    vi.stubGlobal('fetch', listFetchMock);
    const { listAscApps } = await import('../services/asc.service.js');
    const result = await listAscApps();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ appStoreId: '111111111', name: 'App One', bundleId: 'com.example.one' });
    expect(result[1]).toEqual({ appStoreId: '222222222', name: 'App Two', bundleId: null });
    // name falls back to d.id when attributes.name is absent
    expect(result[2]).toEqual({ appStoreId: '333333333', name: '333333333', bundleId: null });
  });

  it('throws ASC_NOT_CONFIGURED when env vars are missing', async () => {
    delete process.env.ASC_KEY_ID;
    delete process.env.ASC_ISSUER_ID;
    delete process.env.ASC_PRIVATE_KEY;
    const { listAscApps } = await import('../services/asc.service.js');
    await expect(listAscApps()).rejects.toThrow('ASC_NOT_CONFIGURED');
  });
});

describe('isAscConfigured', () => {
  it('returns true when all env vars are set', async () => {
    const { isAscConfigured } = await import('../services/asc.service.js');
    expect(isAscConfigured()).toBe(true);
  });

  it('returns false when any env var is missing', async () => {
    delete process.env.ASC_KEY_ID;
    const { isAscConfigured } = await import('../services/asc.service.js');
    expect(isAscConfigured()).toBe(false);
  });
});
