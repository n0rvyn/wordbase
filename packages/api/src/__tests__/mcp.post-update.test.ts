import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createPost } from '../services/post.service.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';

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

describe('post_update MCP tool — scope', () => {
  it('is registered with posts:write scope', () => {
    expect(TOOL_SCOPES.post_update).toBe('posts:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('post_update');
  });
});

describe('post_update MCP tool — partial-update semantics', () => {
  it('changing only the title leaves content untouched', async () => {
    const p = await createPost({ title: 'Original', content: 'ORIGINAL_BODY', status: 'draft' });
    const handler = server.getHandler('post_update')!;
    await handler({ id: p.id, title: 'Renamed' });

    const after = await db.select().from(posts).where(eq(posts.id, p.id));
    expect(after[0].title).toBe('Renamed');
    expect(after[0].content).toBe('ORIGINAL_BODY');
  });

  it('omitting tagIds keeps the existing tag set (=== undefined → keep)', async () => {
    const tag = await createTag({ name: 'AI' });
    await createPost({ title: 'T', content: 'x', status: 'draft', tagIds: [tag.id] });
    const handler = server.getHandler('post_update')!;
    // Re-create a fresh post with a tag so we can grab its id cleanly.
    const post = await createPost({ title: 'T', content: 'x', status: 'draft', tagIds: [tag.id] });
    await handler({ id: post.id, title: 'Renamed' });

    const rows = await db.select().from(postTags).where(eq(postTags.postId, post.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tagId).toBe(tag.id);
  });

  it('tagIds: empty string clears the existing tag set (undefined=keep, empty=clear)', async () => {
    const tag = await createTag({ name: 'AI' });
    const post = await createPost({ title: 'T', content: 'x', status: 'draft', tagIds: [tag.id] });
    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, tagIds: '' });

    const rows = await db.select().from(postTags).where(eq(postTags.postId, post.id));
    expect(rows).toHaveLength(0);
  });

  it('tagIds:"id1,id2" sets the tag set (replaces prior set)', async () => {
    const tag1 = await createTag({ name: 'AI' });
    const tag2 = await createTag({ name: 'Web' });
    const tag3 = await createTag({ name: 'Misc' });
    const post = await createPost({ title: 'T', content: 'x', status: 'draft', tagIds: [tag3.id] });
    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, tagIds: `${tag1.id},${tag2.id}` });

    const rows = await db.select().from(postTags).where(eq(postTags.postId, post.id));
    const ids = rows.map((r) => r.tagId).sort();
    expect(ids).toEqual([tag1.id, tag2.id].sort());
  });

  it('categoryIds three states mirror tagIds (omitted keeps, empty clears)', async () => {
    const cat = await createCategory({ name: 'Essay' });
    const post = await createPost({ title: 'T', content: 'x', status: 'draft', categoryIds: [cat.id] });

    const handler = server.getHandler('post_update')!;

    // omitted → keep
    await handler({ id: post.id, title: 'NoCatChange' });
    const afterKeep = await db.select().from(postCategories).where(eq(postCategories.postId, post.id));
    expect(afterKeep).toHaveLength(1);
    expect(afterKeep[0].categoryId).toBe(cat.id);

    // empty → clear
    await handler({ id: post.id, categoryIds: '' });
    const afterClear = await db.select().from(postCategories).where(eq(postCategories.postId, post.id));
    expect(afterClear).toHaveLength(0);
  });

  it('omitting a scalar field passes undefined through (does not clobber)', async () => {
    const post = await createPost({ title: 'T', content: 'body', excerpt: 'orig excerpt', status: 'draft' });
    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, title: 'Renamed' });

    const rows = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(rows[0].excerpt).toBe('orig excerpt');
  });
});

describe('post_update MCP tool — triggerBuild guard', () => {
  it('updating a published post triggers a rebuild', async () => {
    const post = await createPost({ title: 'Pub', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear(); // ignore create-time build if any

    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, title: 'Pub edited' });

    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('updating a draft post does NOT trigger a rebuild', async () => {
    const post = await createPost({ title: 'Draft', content: 'x', status: 'draft' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, title: 'Draft edited' });

    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('unpublishing (published→draft) triggers a rebuild so the site drops it', async () => {
    const post = await createPost({ title: 'Pub', content: 'x', status: 'published' });
    triggerBuildSpy.mockClear();

    const handler = server.getHandler('post_update')!;
    await handler({ id: post.id, status: 'draft' });

    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('not-found id returns isError and skips build', async () => {
    const handler = server.getHandler('post_update')!;
    const result = await handler({ id: 'nope-does-not-exist', title: 'X' }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});