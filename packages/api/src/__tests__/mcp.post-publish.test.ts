import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { posts, postCategories, postTags } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createPost } from '../services/post.service.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

// Mock build.service before importing tools.js so we can assert rebuild triggers.
// post.service is left real (mirrors the routes.podcast-apps.test pattern).
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

const { triggerBuild } = await import('../services/build.service.js');
const triggerBuildSpy = triggerBuild as ReturnType<typeof vi.fn>;

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

let server: ReturnType<typeof buildCapturingServer>;

beforeEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
  triggerBuildSpy.mockClear();
  vi.clearAllMocks();
  server = buildCapturingServer();
  registerTools(server);
});

afterEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
});

describe('post_publish MCP tool — scope', () => {
  it('is registered with posts:write scope', () => {
    expect(TOOL_SCOPES.post_publish).toBe('posts:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('post_publish');
  });
});

describe('post_publish MCP tool — draft → published', () => {
  it('publishes a draft, sets status=published, and triggers a build', async () => {
    const draft = await createPost({ title: 'Draft', content: 'body', status: 'draft' });
    triggerBuildSpy.mockClear(); // ignore any build calls from setup

    const handler = server.getHandler('post_publish')!;
    const result = await handler({ id: draft.id }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();

    const rows = await db.select().from(posts).where(eq(posts.id, draft.id));
    expect(rows[0].status).toBe('published');
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the published post JSON on success', async () => {
    const draft = await createPost({ title: 'Returned', content: 'x', status: 'draft' });
    const handler = server.getHandler('post_publish')!;
    const result = await handler({ id: draft.id }) as { content: { text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(draft.id);
    expect(parsed.status).toBe('published');
    expect(parsed.title).toBe('Returned');
  });
});

describe('post_publish MCP tool — idempotency on already-published', () => {
  it('publishing an already-published post does NOT trigger a build', async () => {
    const post = await createPost({ title: 'Live', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_publish')!;
    await handler({ id: post.id });

    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('publishing an already-published post returns alreadyPublished: true', async () => {
    const post = await createPost({ title: 'Live', content: 'x', status: 'published' });
    const handler = server.getHandler('post_publish')!;
    const result = await handler({ id: post.id }) as { content: { text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(post.id);
    expect(parsed.status).toBe('published');
    expect(parsed.alreadyPublished).toBe(true);
  });
});

describe('post_publish MCP tool — not found', () => {
  it('returns isError and skips build when the id does not exist', async () => {
    const handler = server.getHandler('post_publish')!;
    const result = await handler({ id: 'nope-does-not-exist' }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});