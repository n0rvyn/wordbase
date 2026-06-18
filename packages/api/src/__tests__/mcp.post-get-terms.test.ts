import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createPost } from '../services/post.service.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

// Mock build.service before importing tools.js — post_get is read-only and should
// never trigger a build, but keep the same harness as the other post-* MCP tests.
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
  await db.delete(tags);
  await db.delete(categories);
  triggerBuildSpy.mockClear();
  vi.clearAllMocks();
  server = buildCapturingServer();
  registerTools(server);
});

afterEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
  await db.delete(tags);
  await db.delete(categories);
});

describe('post_get MCP tool — scope', () => {
  it('is registered with posts:read scope (read tool — unchanged)', () => {
    expect(TOOL_SCOPES.post_get).toBe('posts:read');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('post_get');
  });
});

describe('post_get MCP tool — returns tags + categories', () => {
  it('returns post fields plus tags[] and categories[] for a post with terms', async () => {
    const tag1 = await createTag({ name: 'TypeScript' });
    const tag2 = await createTag({ name: 'Drizzle' });
    const cat = await createCategory({ name: 'Tech', slug: 'tech' });

    const post = await createPost({
      title: 'Hello',
      content: 'world',
      status: 'draft',
      tagIds: [tag1.id, tag2.id],
      categoryIds: [cat.id],
    });

    const handler = server.getHandler('post_get')!;
    const result = await handler({ idOrSlug: post.id }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    // Original post fields preserved (regression shield: additive only).
    expect(body.id).toBe(post.id);
    expect(body.title).toBe('Hello');
    expect(body.content).toBe('world');
    expect(body.slug).toBe(post.slug);

    // New keys present.
    expect(body.tags).toHaveLength(2);
    const tagNames = body.tags.map((t: { name: string }) => t.name).sort();
    expect(tagNames).toEqual(['Drizzle', 'TypeScript']);
    expect(body.tags[0]).toHaveProperty('id');
    expect(body.tags[0]).toHaveProperty('slug');
    expect(body.tags[0]).toHaveProperty('name');

    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].id).toBe(cat.id);
    expect(body.categories[0].slug).toBe('tech');
    expect(body.categories[0].name).toBe('Tech');
  });

  it('returns empty tags[] and categories[] for a post without terms', async () => {
    const post = await createPost({ title: 'Lonely', content: 'no terms', status: 'draft' });

    const handler = server.getHandler('post_get')!;
    const result = await handler({ idOrSlug: post.id }) as { content: { text: string }[] };

    const body = JSON.parse(result.content[0].text);
    expect(body.tags).toEqual([]);
    expect(body.categories).toEqual([]);
  });

  it('resolves by slug and still attaches terms', async () => {
    const tag = await createTag({ name: 'AI' });
    const cat = await createCategory({ name: 'Essay', slug: 'essay' });
    const post = await createPost({
      title: 'FindBySlug',
      content: 'body',
      status: 'draft',
      tagIds: [tag.id],
      categoryIds: [cat.id],
    });

    const handler = server.getHandler('post_get')!;
    const result = await handler({ idOrSlug: post.slug }) as { content: { text: string }[] };
    const body = JSON.parse(result.content[0].text);

    expect(body.id).toBe(post.id);
    expect(body.tags).toHaveLength(1);
    expect(body.tags[0].name).toBe('AI');
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].name).toBe('Essay');
  });

  it('not-found idOrSlug returns isError', async () => {
    const handler = server.getHandler('post_get')!;
    const result = await handler({ idOrSlug: 'does-not-exist' }) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Post not found');
  });

  it('does not trigger a build (read-only)', async () => {
    const post = await createPost({ title: 'R', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_get')!;
    await handler({ idOrSlug: post.id });

    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});