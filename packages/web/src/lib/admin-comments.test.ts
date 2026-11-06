import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAdminComments } from './admin-comments';

afterEach(() => vi.unstubAllGlobals());

function fixture(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('window', { location: { href: '' } });
  vi.stubGlobal('localStorage', { getItem: () => 'comments-read-fixture', removeItem: vi.fn() });
  vi.stubGlobal('fetch', fetch);
}

describe('admin comments loading', () => {
  it('loads a small queue in one authenticated request without fetching posts', async () => {
    const data = [{ id: 'comment', postTitle: 'Old post', content: 'Reader comment' }];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data, total: 1, page: 1, limit: 50 })));
    fixture(fetch);
    const signal = new AbortController().signal;
    expect(await loadAdminComments('pending', signal)).toEqual(data);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/comments\?status=pending&page=1&limit=50$/), {
      signal, headers: { Authorization: 'Bearer comments-read-fixture' },
    });
  });

  it('loads all global pages, including more than 20 comments on one post', async () => {
    const data = Array.from({ length: 72 }, (_, i) => ({ id: String(i), postId: 'old-post' }));
    const fetch = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ data: data.slice((page - 1) * 50, page * 50), total: data.length, page, limit: 50 }));
    });
    fixture(fetch);
    expect(await loadAdminComments('spam', new AbortController().signal)).toEqual(data);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not fetch an extra page for an exact page boundary or empty queue', async () => {
    for (const total of [0, 50]) {
      const fetch = vi.fn(async () => new Response(JSON.stringify({ data: Array.from({ length: total }, (_, i) => ({ id: String(i) })), total, page: 1, limit: 50 })));
      fixture(fetch);
      expect(await loadAdminComments('approved', new AbortController().signal)).toHaveLength(total);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a failed later page instead of presenting an incomplete queue', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'first-page' }], total: 72, page: 1, limit: 50 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Unavailable' } }), { status: 503 }));
    fixture(fetch);
    await expect(loadAdminComments('pending', new AbortController().signal)).rejects.toThrow('Unavailable');
  });

  it('passes cancellation through to fetch', async () => {
    const controller = new AbortController();
    fixture(vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const request = loadAdminComments('pending', controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
