import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTools } from '../mcp/tools.js';

// Task 12: mechanical contract for the REST-parity tools added in this task
// (DP-002 = A) — every new tool must (a) return the standard
// { content: [{ type: 'text', ... }] } shape, (b) return isError when its
// target isn't found, and (c) — delete tools only — rebuild the site iff the
// deleted row's pre-delete status was 'published' (mirrors post_delete /
// page_delete; see Task 12's Regression shield for why this is NOT the same
// condition as the REST delete routes, which never call triggerBuild at all).

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function buildCapturingServer() {
  const handlers = new Map<string, Handler>();
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Handler) {
      handlers.set(name, handler);
    },
    getHandler(name: string) {
      return handlers.get(name);
    },
  };
}

vi.mock('../services/app.service.js', () => ({
  getApp: vi.fn(async () => null),
  deleteApp: vi.fn(async () => null),
}));

vi.mock('../services/media.service.js', () => ({
  getMedia: vi.fn(async () => null),
}));

vi.mock('../services/podcast.service.js', () => ({
  getPodcast: vi.fn(async () => null),
  deletePodcast: vi.fn(async () => null),
}));

vi.mock('../services/episode.service.js', () => ({
  getEpisode: vi.fn(async () => null),
  deleteEpisode: vi.fn(async () => null),
}));

vi.mock('../services/tag.service.js', () => ({
  getTag: vi.fn(async () => null),
}));

vi.mock('../services/category.service.js', () => ({
  getCategory: vi.fn(async () => null),
}));

vi.mock('../services/site.service.js', () => ({
  getSiteIdentity: vi.fn(async () => ({
    name: 'norvyn', description: 'desc', author: 'norvyn', email: 'norvyn@norvyn.com', github: 'https://github.com/n0rvyn',
  })),
  SITE_IDENTITY_SETTINGS_KEYS: {
    name: 'site.title',
    description: 'site.description',
    author: 'site.author',
    email: 'site.email',
    github: 'social.github',
  },
}));

vi.mock('../services/settings.service.js', () => ({
  updateSettings: vi.fn(async (data: Record<string, string>) => data),
}));

vi.mock('../services/observability.service.js', () => ({
  getRequestMetrics: vi.fn(async () => ({ hours: 24, endpoints: [] })),
  getSystemStatus: vi.fn(() => ({ ok: true })),
}));

vi.mock('../services/seo-health.service.js', () => ({
  getSeoHealth: vi.fn(() => ({ issues: [] })),
}));

vi.mock('../services/analytics.service.js', () => ({
  getVisitorSummary: vi.fn(async () => ({ pv: 1 })),
  getVisitTrends: vi.fn(async () => []),
  getTopPages: vi.fn(async () => []),
  getReferrers: vi.fn(async () => []),
  getShareStats: vi.fn(async () => ({})),
  getRegions: vi.fn(async () => []),
  getDeviceBreakdown: vi.fn(async () => ({})),
  getContentStats: vi.fn(async () => ({})),
}));

vi.mock('../services/podcast-analytics.service.js', () => ({
  getPodcastSummary: vi.fn(async () => ({})),
  getPodcastTrends: vi.fn(async () => []),
  getTopEpisodes: vi.fn(async () => []),
  getEpisodeDownloadTable: vi.fn(async () => []),
  getPodcastClients: vi.fn(async () => []),
}));

vi.mock('../services/build.service.js', () => ({
  triggerBuild: vi.fn(async () => ({ status: 'ok' })),
  getBuildStatus: vi.fn(() => ({ status: 'idle' })),
}));

describe('mcp.parity — REST-parity tools added in Task 12', () => {
  let server: ReturnType<typeof buildCapturingServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = buildCapturingServer();
    registerTools(server as any);
  });

  // ── (a) + (b): get-style tools ────────────────────────────────────────────
  const getCases: Array<{
    tool: string;
    modulePath: string;
    fn: string;
    arg: Record<string, unknown>;
    found: unknown;
  }> = [
    { tool: 'app_get', modulePath: '../services/app.service.js', fn: 'getApp', arg: { idOrSlug: 'delphi' }, found: { id: 'app1', status: 'draft' } },
    { tool: 'media_get', modulePath: '../services/media.service.js', fn: 'getMedia', arg: { id: 'm1' }, found: { id: 'm1' } },
    { tool: 'podcast_get_show', modulePath: '../services/podcast.service.js', fn: 'getPodcast', arg: { idOrSlug: 'show' }, found: { id: 'pod1' } },
    { tool: 'podcast_get_episode', modulePath: '../services/episode.service.js', fn: 'getEpisode', arg: { idOrSlug: 'ep' }, found: { id: 'ep1' } },
    { tool: 'tag_get', modulePath: '../services/tag.service.js', fn: 'getTag', arg: { idOrSlug: 'ai' }, found: { id: 'tag1' } },
    { tool: 'category_get', modulePath: '../services/category.service.js', fn: 'getCategory', arg: { idOrSlug: 'life' }, found: { id: 'cat1' } },
  ];

  it.each(getCases)('$tool: not-found returns isError, found returns { content: [{ type: text }] }', async ({ tool, modulePath, fn, arg, found }) => {
    const mod = (await import(modulePath)) as Record<string, ReturnType<typeof vi.fn>>;
    const handler = server.getHandler(tool)!;

    const notFound = await handler(arg);
    expect(notFound.isError).toBe(true);
    expect(notFound.content[0].type).toBe('text');

    (mod[fn] as ReturnType<typeof vi.fn>).mockResolvedValueOnce(found);
    const ok = await handler(arg);
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0].type).toBe('text');
    expect(JSON.parse(ok.content[0].text)).toEqual(found);
  });

  // ── (b) + (c): delete-style tools ─────────────────────────────────────────
  const deleteCases: Array<{ tool: string; modulePath: string; fn: string; arg: Record<string, unknown> }> = [
    { tool: 'app_delete', modulePath: '../services/app.service.js', fn: 'deleteApp', arg: { id: 'app1' } },
    { tool: 'podcast_delete_show', modulePath: '../services/podcast.service.js', fn: 'deletePodcast', arg: { id: 'pod1' } },
    { tool: 'podcast_delete_episode', modulePath: '../services/episode.service.js', fn: 'deleteEpisode', arg: { id: 'ep1' } },
  ];

  it.each(deleteCases)('$tool: not found → isError, no rebuild', async ({ tool, arg }) => {
    const { triggerBuild } = await import('../services/build.service.js');
    const handler = server.getHandler(tool)!;
    const result = await handler(arg);
    expect(result.isError).toBe(true);
    expect(triggerBuild).not.toHaveBeenCalled();
  });

  it.each(deleteCases)('$tool: deleting a published row triggers a rebuild', async ({ tool, modulePath, fn, arg }) => {
    const mod = (await import(modulePath)) as Record<string, ReturnType<typeof vi.fn>>;
    const { triggerBuild } = await import('../services/build.service.js');
    (mod[fn] as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: arg.id, status: 'published' });
    const handler = server.getHandler(tool)!;
    const result = await handler(arg);
    expect(result.isError).toBeUndefined();
    expect(triggerBuild).toHaveBeenCalledOnce();
  });

  it.each(deleteCases)('$tool: deleting a draft row does NOT trigger a rebuild', async ({ tool, modulePath, fn, arg }) => {
    const mod = (await import(modulePath)) as Record<string, ReturnType<typeof vi.fn>>;
    const { triggerBuild } = await import('../services/build.service.js');
    (mod[fn] as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: arg.id, status: 'draft' });
    const handler = server.getHandler(tool)!;
    const result = await handler(arg);
    expect(result.isError).toBeUndefined();
    expect(triggerBuild).not.toHaveBeenCalled();
  });

  // ── settings_get_site / settings_update_site ──────────────────────────────
  it('settings_get_site returns the resolved site identity', async () => {
    const handler = server.getHandler('settings_get_site')!;
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.name).toBe('norvyn');
  });

  it('settings_update_site maps whitelisted fields to settings keys, ignores unknown fields, and rebuilds', async () => {
    const { updateSettings } = await import('../services/settings.service.js');
    const { triggerBuild } = await import('../services/build.service.js');
    const handler = server.getHandler('settings_update_site')!;
    const result = await handler({ name: 'New Name', description: 'New tagline', bogus: 'should be dropped' });

    expect(updateSettings).toHaveBeenCalledWith({ 'site.title': 'New Name', 'site.description': 'New tagline' });
    expect(triggerBuild).toHaveBeenCalledOnce();
    expect(result.isError).toBeUndefined();
  });

  it('settings_update_site with no known fields returns isError and does not write or rebuild', async () => {
    const { updateSettings } = await import('../services/settings.service.js');
    const { triggerBuild } = await import('../services/build.service.js');
    const handler = server.getHandler('settings_update_site')!;
    const result = await handler({ bogus: 'x' });

    expect(result.isError).toBe(true);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(triggerBuild).not.toHaveBeenCalled();
  });

  // ── observability_query ────────────────────────────────────────────────
  const sections: Array<{ section: string; modulePath: string; fn: string }> = [
    { section: 'visits', modulePath: '../services/analytics.service.js', fn: 'getVisitorSummary' },
    { section: 'trends', modulePath: '../services/analytics.service.js', fn: 'getVisitTrends' },
    { section: 'top-pages', modulePath: '../services/analytics.service.js', fn: 'getTopPages' },
    { section: 'referrers', modulePath: '../services/analytics.service.js', fn: 'getReferrers' },
    { section: 'shares', modulePath: '../services/analytics.service.js', fn: 'getShareStats' },
    { section: 'regions', modulePath: '../services/analytics.service.js', fn: 'getRegions' },
    { section: 'devices', modulePath: '../services/analytics.service.js', fn: 'getDeviceBreakdown' },
    { section: 'content', modulePath: '../services/analytics.service.js', fn: 'getContentStats' },
    { section: 'requests', modulePath: '../services/observability.service.js', fn: 'getRequestMetrics' },
    { section: 'system', modulePath: '../services/observability.service.js', fn: 'getSystemStatus' },
    { section: 'seo-health', modulePath: '../services/seo-health.service.js', fn: 'getSeoHealth' },
    { section: 'podcast-summary', modulePath: '../services/podcast-analytics.service.js', fn: 'getPodcastSummary' },
    { section: 'podcast-trends', modulePath: '../services/podcast-analytics.service.js', fn: 'getPodcastTrends' },
    { section: 'podcast-top-episodes', modulePath: '../services/podcast-analytics.service.js', fn: 'getTopEpisodes' },
    { section: 'podcast-episodes', modulePath: '../services/podcast-analytics.service.js', fn: 'getEpisodeDownloadTable' },
    { section: 'podcast-clients', modulePath: '../services/podcast-analytics.service.js', fn: 'getPodcastClients' },
  ];

  it.each(sections)('observability_query section=$section dispatches to $fn and returns { content: [{ type: text }] }', async ({ section, modulePath, fn }) => {
    const mod = (await import(modulePath)) as Record<string, ReturnType<typeof vi.fn>>;
    const handler = server.getHandler('observability_query')!;
    const result = await handler({ section, days: 7, limit: 5 });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    expect(mod[fn]).toHaveBeenCalledOnce();
  });

  it('observability_query with an unknown section returns isError', async () => {
    const handler = server.getHandler('observability_query')!;
    const result = await handler({ section: 'not-a-real-section' });
    expect(result.isError).toBe(true);
  });
});
