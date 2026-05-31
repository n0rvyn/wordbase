import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub global fetch before importing the module under test
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Astro's import.meta.env is not available in vitest — stub it
vi.stubGlobal('import', {
  meta: { env: { API_URL: 'http://localhost:4100' } },
});

// Helper to create a mock response
function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: () => Promise.resolve(body),
  } as Response);
}

describe('api.ts — new getters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ---- getApps ----
  describe('getApps', () => {
    it('requests /api/apps with status query param', async () => {
      const { getApps } = await import('./api.ts');
      const envelope = { data: [], total: 0, page: 1, limit: 20 };
      mockFetch.mockReturnValue(mockResponse(envelope));

      const result = await getApps({ status: 'published' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const url: string = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/apps');
      expect(url).toContain('status=published');
      expect(result).toEqual(envelope);
    });

    it('requests /api/apps without query when no params', async () => {
      const { getApps } = await import('./api.ts');
      const envelope = { data: [], total: 0, page: 1, limit: 20 };
      mockFetch.mockReturnValue(mockResponse(envelope));

      await getApps();

      const url: string = mockFetch.mock.calls[0][0];
      expect(url).toMatch(/\/api\/apps(\?.*)?$/);
    });
  });

  // ---- getApp ----
  describe('getApp', () => {
    it('requests /api/apps/:slug', async () => {
      const { getApp } = await import('./api.ts');
      const app = { id: '1', slug: 'tidemark', name: 'Tidemark' };
      mockFetch.mockReturnValue(mockResponse(app));

      const result = await getApp('tidemark');

      expect(mockFetch).toHaveBeenCalledOnce();
      const url: string = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/apps/tidemark');
      expect(result).toEqual(app);
    });

    it('returns null on 404', async () => {
      const { getApp } = await import('./api.ts');
      mockFetch.mockReturnValue(mockResponse({ error: { code: 'NOT_FOUND' } }, 404));

      const result = await getApp('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      const { getApp } = await import('./api.ts');
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await getApp('anything');

      expect(result).toBeNull();
    });
  });

  // ---- getPodcasts ----
  describe('getPodcasts', () => {
    it('requests /api/podcasts with status query param', async () => {
      const { getPodcasts } = await import('./api.ts');
      const envelope = { data: [], total: 0, page: 1, limit: 20 };
      mockFetch.mockReturnValue(mockResponse(envelope));

      const result = await getPodcasts({ status: 'published' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const url: string = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/podcasts');
      expect(url).toContain('status=published');
      expect(result).toEqual(envelope);
    });
  });

  // ---- getEpisodes ----
  describe('getEpisodes', () => {
    it('requests /api/podcasts/:slug/episodes', async () => {
      const { getEpisodes } = await import('./api.ts');
      const envelope = { data: [], total: 0, page: 1, limit: 20 };
      mockFetch.mockReturnValue(mockResponse(envelope));

      const result = await getEpisodes('bianjiao', { status: 'published' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const url: string = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/podcasts/bianjiao/episodes');
      expect(url).toContain('status=published');
      expect(result).toEqual(envelope);
    });
  });

  // ---- regression: getPosts still exported ----
  describe('regression: existing exports', () => {
    it('getPosts is still exported and callable', async () => {
      const { getPosts } = await import('./api.ts');
      expect(typeof getPosts).toBe('function');

      const envelope = { data: [], total: 0, page: 1, limit: 10 };
      mockFetch.mockReturnValue(mockResponse(envelope));

      const result = await getPosts({ status: 'published' });
      expect(result).toEqual(envelope);
    });
  });
});
