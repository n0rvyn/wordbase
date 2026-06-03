import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../mcp/tools.js';

// ── Existing harness (names only, handlers discarded) ──────────────────────
function buildFakeServer() {
  const names: string[] = [];
  const server = {
    tool(name: string, _desc: string, _schema: unknown, _handler: unknown) {
      names.push(name);
    },
    getNames() {
      return names;
    },
  };
  return server;
}

// ── New harness (captures name → handler for behavior tests) ───────────────
type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function buildCapturingServer() {
  const handlers = new Map<string, Handler>();
  const names: string[] = [];
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Handler) {
      names.push(name);
      handlers.set(name, handler);
    },
    getHandler(name: string) {
      return handlers.get(name);
    },
    getNames() {
      return names;
    },
  };
}

// ── Mock services ──────────────────────────────────────────────────────────
vi.mock('../services/app.service.js', () => ({
  listApps: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20 })),
  getApp: vi.fn(async () => null),
  createApp: vi.fn(async (data: Record<string, unknown>) => ({ id: 'app1', ...data })),
  updateApp: vi.fn(async (_id: string, data: Record<string, unknown>) => ({ id: _id, ...data })),
  deleteApp: vi.fn(async () => null),
  publishApp: vi.fn(async () => null),
  discoverApps: vi.fn(async () => ({ created: [], existing: [] })),
}));

vi.mock('../services/page.service.js', () => ({
  listPages: vi.fn(async () => []),
  getPage: vi.fn(async () => null),
  createPage: vi.fn(async (data: Record<string, unknown>) => ({ id: 'page1', ...data })),
  updatePage: vi.fn(async () => null),
  deletePage: vi.fn(async () => null),
  publishPage: vi.fn(async () => null),
}));

vi.mock('../services/post.service.js', () => ({
  listPosts: vi.fn(async () => ({ data: [], total: 0 })),
  getPost: vi.fn(async () => null),
  createPost: vi.fn(async (data: Record<string, unknown>) => ({ id: 'post1', ...data })),
  updatePost: vi.fn(async () => null),
}));

vi.mock('../services/media.service.js', () => ({
  listMedia: vi.fn(async () => ({ data: [], total: 0 })),
  uploadMedia: vi.fn(async () => ({ id: 'media1' })),
  deleteMedia: vi.fn(async () => null),
}));

vi.mock('../services/comment.service.js', () => ({
  listComments: vi.fn(async () => ({ data: [], total: 0 })),
  updateCommentStatus: vi.fn(async () => null),
  createComment: vi.fn(async () => ({ id: 'comment1' })),
  deleteComment: vi.fn(async () => null),
}));

vi.mock('../services/analytics.service.js', () => ({
  getOverview: vi.fn(async () => ({})),
  getTopPosts: vi.fn(async () => []),
  getTrends: vi.fn(async () => []),
  getContentStats: vi.fn(async () => ({})),
}));

vi.mock('../services/build.service.js', () => ({
  triggerBuild: vi.fn(async () => ({ status: 'ok' })),
  getBuildStatus: vi.fn(() => ({ status: 'idle' })),
}));

vi.mock('../services/redirect.service.js', () => ({
  listRedirects: vi.fn(async () => []),
  createRedirect: vi.fn(async (data: Record<string, unknown>) => ({ id: 'r1', ...data })),
  deleteRedirect: vi.fn(async () => null),
}));

vi.mock('../services/podcast.service.js', () => ({
  listPodcasts: vi.fn(async () => ({ data: [], total: 0 })),
  createPodcast: vi.fn(async (data: Record<string, unknown>) => ({ id: 'pod1', ...data })),
  publishPodcast: vi.fn(async () => null),
}));

vi.mock('../services/episode.service.js', () => ({
  listEpisodes: vi.fn(async () => ({ data: [], total: 0 })),
  createEpisode: vi.fn(async (data: Record<string, unknown>) => ({ id: 'ep1', ...data })),
  upsertEpisodeByExternal: vi.fn(async (data: Record<string, unknown>) => ({ id: 'ep1', ...data })),
  publishEpisode: vi.fn(async () => null),
  uploadEpisodeAudio: vi.fn(async () => ({ url: 'http://example.com/audio.mp3' })),
}));

vi.mock('../services/app-sync.service.js', () => ({
  syncApp: vi.fn(async () => undefined),
  syncAllApps: vi.fn(async () => ({ synced: 0, failed: 0 })),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('registerTools — tool name registration', () => {
  it('registers all existing blog_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('blog_create_post');
    expect(names).toContain('blog_upload_media');
    expect(names).toContain('blog_list_posts');
    expect(names).toContain('blog_get_post');
    expect(names).toContain('blog_list_media');
    expect(names).toContain('blog_trigger_build');
  });

  it('registers new podcast_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('podcast_list_shows');
    expect(names).toContain('podcast_create_show');
    expect(names).toContain('podcast_publish_show');
    expect(names).toContain('podcast_list_episodes');
    expect(names).toContain('podcast_create_episode');
    expect(names).toContain('podcast_upload_audio');
    expect(names).toContain('podcast_publish_episode');
  });

  it('registers new app_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('app_list');
    expect(names).toContain('app_create');
    expect(names).toContain('app_publish');
  });

  it('registers 8 new Phase 8 tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('page_list');
    expect(names).toContain('page_get');
    expect(names).toContain('page_create');
    expect(names).toContain('page_update');
    expect(names).toContain('page_delete');
    expect(names).toContain('page_publish');
    expect(names).toContain('app_update');
    expect(names).toContain('app_discover');
  });
});

// Exercises the REAL SDK serialization path (the one the mocked harness above
// never touches). The plain { type, description } input schemas used to be
// misread by the SDK as `annotations`, which made tools/list emit an
// `annotations.title` object and crash the client on the 5 title-bearing tools.
// This block connects a real Client to a real McpServer over an in-memory
// transport and asserts on the actual tools/list response.
describe('registerTools — real tools/list serialization', () => {
  async function listToolsViaRealSdk() {
    const mcp = new McpServer({ name: 'wordbase-test', version: '0.0.0' });
    registerTools(mcp);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    await client.close();
    return tools;
  }

  // The 5 tools whose input schema carries a `title` field — the exact ones that
  // previously produced the `annotations.title` invalid_type crash.
  const TITLE_TOOLS = [
    'blog_create_post',
    'podcast_create_show',
    'podcast_create_episode',
    'page_create',
    'page_update',
  ];

  it('tools/list succeeds and no tool emits an object-valued annotations.title', async () => {
    const tools = await listToolsViaRealSdk();
    expect(tools.length).toBeGreaterThan(30);
    for (const t of tools) {
      const title = t.annotations?.title;
      // annotations.title, if present, must be a string — never the schema object.
      expect(typeof title === 'undefined' || typeof title === 'string').toBe(true);
    }
  });

  it('title-bearing tools advertise `title` as an input parameter, not an annotation', async () => {
    const tools = await listToolsViaRealSdk();
    for (const name of TITLE_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `tool ${name} should be listed`).toBeDefined();
      expect(tool!.inputSchema.properties).toHaveProperty('title');
      expect(tool!.annotations?.title).toBeUndefined();
    }
  });

  it('input schema descriptions survive into the emitted JSON', async () => {
    const tools = await listToolsViaRealSdk();
    const createPost = tools.find((t) => t.name === 'blog_create_post')!;
    const props = createPost.inputSchema.properties as Record<string, { description?: string }>;
    expect(props.title.description).toBe('Post title');
    expect(props.content.description).toBe('Post content in Markdown');
  });
});

describe('registerTools — handler behavior (Phase 8)', () => {
  let server: ReturnType<typeof buildCapturingServer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = buildCapturingServer();
    registerTools(server);
  });

  it('app_update drops sync-owned fields (description/screenshots/icon/appStoreId/rating)', async () => {
    const { updateApp } = await import('../services/app.service.js');
    const handler = server.getHandler('app_update')!;
    await handler({
      id: 'app1',
      name: 'My App',
      tagline: 'Cool tagline',
      // sync-owned fields that must be dropped:
      description: 'Should be dropped',
      screenshots: '["url1"]',
      icon: 'http://icon.png',
      appStoreId: '12345',
      rating: 4.5,
    });

    expect(updateApp).toHaveBeenCalledOnce();
    const callArgs = (updateApp as ReturnType<typeof vi.fn>).mock.calls[0];
    const passedData = callArgs[1] as Record<string, unknown>;

    // sync-safe fields pass through
    expect(passedData.name).toBe('My App');
    expect(passedData.tagline).toBe('Cool tagline');

    // sync-owned fields must NOT be forwarded
    expect(passedData).not.toHaveProperty('description');
    expect(passedData).not.toHaveProperty('screenshots');
    expect(passedData).not.toHaveProperty('icon');
    expect(passedData).not.toHaveProperty('appStoreId');
    expect(passedData).not.toHaveProperty('rating');
  });

  it('page_create with app arg stamps meta.appId', async () => {
    const { createPage } = await import('../services/page.service.js');
    const handler = server.getHandler('page_create')!;
    await handler({
      title: 'Delphi Privacy Policy',
      content: '# Privacy',
      slug: 'delphi-privacy',
      app: 'delphi',
    });

    expect(createPage).toHaveBeenCalledOnce();
    const callArgs = (createPage as ReturnType<typeof vi.fn>).mock.calls[0];
    const passedData = callArgs[0] as Record<string, unknown>;
    const meta = JSON.parse(passedData.meta as string);
    expect(meta.appId).toBe('delphi');
  });

  it('page_create with app arg + malformed meta returns isError (no throw, no createPage)', async () => {
    const { createPage } = await import('../services/page.service.js');
    (createPage as ReturnType<typeof vi.fn>).mockClear();
    const handler = server.getHandler('page_create')!;
    const result = await handler({
      title: 'Bad Meta Page',
      content: '# x',
      app: 'delphi',
      meta: '{not valid json',
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(createPage).not.toHaveBeenCalled();
  });

  it('page_publish calls publishPage (not updatePage) and returns isError on null', async () => {
    const { publishPage, updatePage } = await import('../services/page.service.js');
    const handler = server.getHandler('page_publish')!;
    // publishPage mock returns null by default
    const result = await handler({ id: 'nonexistent' }) as { isError?: boolean };

    expect(publishPage).toHaveBeenCalledOnce();
    expect(updatePage).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});

// The REST publish routes (routes/podcasts.ts, routes/apps.ts) call triggerBuild()
// so the static site rebuilds. The MCP publish handlers used to skip it, so an
// MCP-driven publish left the site stale. These assert parity.
describe('registerTools — MCP publish triggers a rebuild (parity with REST)', () => {
  let server: ReturnType<typeof buildCapturingServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = buildCapturingServer();
    registerTools(server);
  });

  it('podcast_publish_show triggers build on success, but not on not-found', async () => {
    const { triggerBuild } = await import('../services/build.service.js');
    const { publishPodcast } = await import('../services/podcast.service.js');

    // not-found → no rebuild
    (publishPodcast as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await server.getHandler('podcast_publish_show')!({ id: 'missing' });
    expect(triggerBuild).not.toHaveBeenCalled();

    // success → rebuild fires
    (publishPodcast as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'p1', status: 'published' });
    await server.getHandler('podcast_publish_show')!({ id: 'p1' });
    expect(triggerBuild).toHaveBeenCalledOnce();
  });

  it('podcast_publish_episode triggers build on success', async () => {
    const { triggerBuild } = await import('../services/build.service.js');
    const { publishEpisode } = await import('../services/episode.service.js');
    (publishEpisode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'e1', status: 'published' });
    await server.getHandler('podcast_publish_episode')!({ id: 'e1' });
    expect(triggerBuild).toHaveBeenCalledOnce();
  });

  it('app_publish triggers build on success', async () => {
    const { triggerBuild } = await import('../services/build.service.js');
    const { publishApp } = await import('../services/app.service.js');
    (publishApp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a1', status: 'published' });
    await server.getHandler('app_publish')!({ id: 'a1' });
    expect(triggerBuild).toHaveBeenCalledOnce();
  });
});
