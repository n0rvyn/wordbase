import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupApp } from '../services/appstore-lookup.service.js';

const mockLookupResult = {
  resultCount: 1,
  results: [
    {
      primaryGenreName: 'Productivity',
      version: '4.2.1',
      releaseDate: '2018-03-15T07:00:00Z',
      currentVersionReleaseDate: '2024-01-10T08:00:00Z',
      averageUserRating: 4.7,
      userRatingCount: 12345,
      minimumOsVersion: '16.0',
      artworkUrl512: 'https://example.com/icon512.png',
      screenshotUrls: [
        'https://example.com/screen1.png',
        'https://example.com/screen2.png',
      ],
      formattedPrice: 'Free',
      description: 'A great productivity app.',
      kind: 'software',
    },
  ],
};

const mockMacLookupResult = {
  resultCount: 1,
  results: [
    {
      primaryGenreName: 'Developer Tools',
      version: '1.2.0',
      releaseDate: '2023-06-01T07:00:00Z',
      currentVersionReleaseDate: '2024-05-15T08:00:00Z',
      averageUserRating: 4.5,
      userRatingCount: 200,
      minimumOsVersion: '13.0',
      artworkUrl512: 'https://example.com/mac-icon512.png',
      screenshotUrls: [
        'https://example.com/mac-screen1.png',
      ],
      formattedPrice: '$9.99',
      description: 'A Mac productivity app.',
      kind: 'mac-software',
    },
  ],
};

const mockEmptyResult = {
  resultCount: 0,
  results: [],
};

const mockBadDateResult = {
  resultCount: 1,
  results: [
    {
      primaryGenreName: 'Utilities',
      version: '1.0',
      releaseDate: 'not-a-date',
      currentVersionReleaseDate: 'also-bad',
      averageUserRating: 3.5,
      userRatingCount: 100,
      minimumOsVersion: '15.0',
      artworkUrl512: 'https://example.com/icon.png',
      screenshotUrls: [],
      formattedPrice: '$1.99',
      description: 'App with bad dates.',
    },
  ],
};

function makeFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetch(mockLookupResult));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupApp', () => {
  it('maps fields correctly for a real app', async () => {
    const result = await lookupApp('361304891');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('Productivity');
    expect(result!.version).toBe('4.2.1');
    expect(typeof result!.releaseDate).toBe('number');
    expect(result!.releaseDate).toBeGreaterThan(0);
    expect(typeof result!.currentVersionReleaseDate).toBe('number');
    expect(result!.currentVersionReleaseDate).toBeGreaterThan(0);
    expect(typeof result!.rating).toBe('number');
    expect(result!.rating).toBeCloseTo(4.7);
    expect(result!.ratingCount).toBe(12345);
    expect(result!.minimumOsVersion).toBe('16.0');
    expect(result!.icon).toBe('https://example.com/icon512.png');
    expect(Array.isArray(result!.screenshots)).toBe(true);
    expect(result!.screenshots).toHaveLength(2);
    expect(result!.price).toBe('Free');
    expect(result!.platform).toBe('iOS');
  });

  it('reports platform as macOS when kind is mac-software', async () => {
    vi.stubGlobal('fetch', makeFetch(mockMacLookupResult));
    const result = await lookupApp('6760217982');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('macOS');
    expect(result!.category).toBe('Developer Tools');
    expect(result!.screenshots).toHaveLength(1);
  });

  it('returns null when resultCount is 0', async () => {
    vi.stubGlobal('fetch', makeFetch(mockEmptyResult));
    const result = await lookupApp('999999999');
    expect(result).toBeNull();
  });

  it('throws for non-numeric appStoreId without calling fetch', async () => {
    const fetchMock = makeFetch(mockLookupResult);
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupApp('abc')).rejects.toThrow('invalid appStoreId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws for empty appStoreId', async () => {
    await expect(lookupApp('')).rejects.toThrow('invalid appStoreId');
  });

  it('returns null for releaseDate and currentVersionReleaseDate when dates are invalid', async () => {
    vi.stubGlobal('fetch', makeFetch(mockBadDateResult));
    const result = await lookupApp('123456789');
    expect(result).not.toBeNull();
    expect(result!.releaseDate).toBeNull();
    expect(result!.currentVersionReleaseDate).toBeNull();
  });
});
