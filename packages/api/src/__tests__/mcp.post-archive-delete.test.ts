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

describe('post_archive MCP tool — scope', () => {
  it('is registered with posts:write scope', () => {
    expect(TOOL_SCOPES.post_archive).toBe('posts:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('post_archive');
  });
});

describe('post_archive MCP tool — behavior', () => {
  it('archives a published post and triggers a rebuild (so the live page is dropped)', async () => {
    const post = await createPost({ title: 'Live', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_archive')!;
    const result = await handler({ id: post.id }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();

    const rows = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(rows[0].status).toBe('archived');
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('archiving a draft does NOT trigger a rebuild', async () => {
    const post = await createPost({ title: 'Draft', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_archive')!;
    await handler({ id: post.id });

    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('not-found id returns isError and skips build', async () => {
    const handler = server.getHandler('post_archive')!;
    const result = await handler({ id: 'nope-does-not-exist' }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('post_delete MCP tool — scope', () => {
  it('is registered with posts:write scope', () => {
    expect(TOOL_SCOPES.post_delete).toBe('posts:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('post_delete');
  });
});

describe('post_delete MCP tool — behavior', () => {
  it('deletes a published post and triggers a rebuild (so the live page is dropped)', async () => {
    const post = await createPost({ title: 'Live', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_delete')!;
    const result = await handler({ id: post.id }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();

    const rows = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(rows).toHaveLength(0);
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('deleting a draft does NOT trigger a rebuild', async () => {
    const post = await createPost({ title: 'Draft', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_delete')!;
    await handler({ id: post.id });

    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('not-found id returns isError and skips build', async () => {
    const handler = server.getHandler('post_delete')!;
    const result = await handler({ id: 'nope-does-not-exist' }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});