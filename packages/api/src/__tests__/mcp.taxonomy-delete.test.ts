import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postTags, postCategories, posts, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';
import { createPost } from '../services/post.service.js';

// MUST-FIX-2 (verifier): Task 5 build-decision tests must use a partial mock
// of build.service — replace ONLY `triggerBuild` with a spy, keep the real
// tag/category/post services + real DB so `usedByPublished` is genuine. A
// full-mock of the services would make `usedByPublished` a stub and the
// published-vs-draft assertions would be hollow.
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return {
    ...original,
    triggerBuild: vi.fn().mockResolvedValue(undefined),
  };
});

const { triggerBuild } = await import('../services/build.service.js');
const triggerBuildSpy = triggerBuild as ReturnType<typeof vi.fn>;

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

// resetNewTables() does NOT cover tags/categories/post_tags/post_categories/
// posts, so each test cleans up explicitly (plan MUST-FIX-1).
afterEach(async () => {
  await db.delete(postTags);
  await db.delete(postCategories);
  await db.delete(posts);
  await db.delete(tags);
  await db.delete(categories);
  triggerBuildSpy.mockClear();
});

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
  server = buildCapturingServer();
  registerTools(server);
});

describe('tag_delete MCP tool — scope', () => {
  it('is registered with tags:write scope', () => {
    expect(TOOL_SCOPES.tag_delete).toBe('tags:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('tag_delete');
  });
});

describe('category_delete MCP tool — scope', () => {
  it('is registered with categories:write scope', () => {
    expect(TOOL_SCOPES.category_delete).toBe('categories:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('category_delete');
  });
});

describe('tag_delete MCP tool — behavior', () => {
  it('deletes a tag and removes its row', async () => {
    const tag = await createTag({ name: 'doomed' });
    const handler = server.getHandler('tag_delete')!;

    const result = await handler({ id: tag.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text) as { success: boolean; id: string };
    expect(body).toEqual({ success: true, id: tag.id });

    // Verify it's gone from the DB (not just hidden)
    const remaining = await db.select().from(tags).where(eq(tags.id, tag.id));
    expect(remaining).toHaveLength(0);
  });

  it('cascades the delete to post_tags junction rows', async () => {
    const tag = await createTag({ name: 'linked' });
    const post = await createPost({ title: 'p', content: 'b', status: 'draft' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });

    const handler = server.getHandler('tag_delete')!;
    const result = await handler({ id: tag.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();

    // Junction row must be gone (DB ON DELETE CASCADE)
    const junction = await db.select().from(postTags).where(eq(postTags.tagId, tag.id));
    expect(junction).toHaveLength(0);

    // The post itself must NOT be deleted — only the association
    const remainingPost = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(remainingPost).toHaveLength(1);
  });

  it('returns isError for an unknown tag id', async () => {
    const handler = server.getHandler('tag_delete')!;
    const result = await handler({ id: 'nonexistent-id' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('tag_delete MCP tool — build decision (DP-004)', () => {
  it('triggers a rebuild when the tag is attached to a published post', async () => {
    const tag = await createTag({ name: 'published-tag' });
    const post = await createPost({ title: 'Live', content: 'b', status: 'published' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });

    const handler = server.getHandler('tag_delete')!;
    const result = await handler({ id: tag.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);

    // Post still exists; only the tag association is gone
    const remainingPost = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(remainingPost).toHaveLength(1);
    const junction = await db.select().from(postTags).where(eq(postTags.tagId, tag.id));
    expect(junction).toHaveLength(0);
  });

  it('does NOT trigger a rebuild when the tag is only attached to drafts', async () => {
    const tag = await createTag({ name: 'drafts-only-tag' });
    const draft = await createPost({ title: 'WIP', content: 'b', status: 'draft' });
    await db.insert(postTags).values({ postId: draft.id, tagId: tag.id });

    const handler = server.getHandler('tag_delete')!;
    const result = await handler({ id: tag.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger a rebuild when the tag has no posts attached', async () => {
    const tag = await createTag({ name: 'lonely-tag' });

    const handler = server.getHandler('tag_delete')!;
    const result = await handler({ id: tag.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('category_delete MCP tool — behavior', () => {
  it('deletes a category and removes its row', async () => {
    const cat = await createCategory({ name: 'doomed-cat' });
    const handler = server.getHandler('category_delete')!;

    const result = await handler({ id: cat.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text) as { success: boolean; id: string };
    expect(body).toEqual({ success: true, id: cat.id });

    const remaining = await db.select().from(categories).where(eq(categories.id, cat.id));
    expect(remaining).toHaveLength(0);
  });

  it('cascades the delete to post_categories junction rows', async () => {
    const cat = await createCategory({ name: 'linked-cat' });
    const post = await createPost({ title: 'p', content: 'b', status: 'draft' });
    await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });

    const handler = server.getHandler('category_delete')!;
    const result = await handler({ id: cat.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();

    const junction = await db.select().from(postCategories).where(eq(postCategories.categoryId, cat.id));
    expect(junction).toHaveLength(0);

    // The post itself must NOT be deleted — only the association
    const remainingPost = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(remainingPost).toHaveLength(1);
  });

  it('returns isError for an unknown category id', async () => {
    const handler = server.getHandler('category_delete')!;
    const result = await handler({ id: 'nonexistent-id' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('category_delete MCP tool — build decision (DP-004)', () => {
  it('triggers a rebuild when the category is attached to a published post', async () => {
    const cat = await createCategory({ name: 'published-cat' });
    const post = await createPost({ title: 'Live', content: 'b', status: 'published' });
    await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });

    const handler = server.getHandler('category_delete')!;
    const result = await handler({ id: cat.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);

    const remainingPost = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(remainingPost).toHaveLength(1);
    const junction = await db.select().from(postCategories).where(eq(postCategories.categoryId, cat.id));
    expect(junction).toHaveLength(0);
  });

  it('does NOT trigger a rebuild when the category is only attached to drafts', async () => {
    const cat = await createCategory({ name: 'drafts-only-cat' });
    const draft = await createPost({ title: 'WIP', content: 'b', status: 'draft' });
    await db.insert(postCategories).values({ postId: draft.id, categoryId: cat.id });

    const handler = server.getHandler('category_delete')!;
    const result = await handler({ id: cat.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger a rebuild when the category has no posts attached', async () => {
    const cat = await createCategory({ name: 'lonely-cat' });

    const handler = server.getHandler('category_delete')!;
    const result = await handler({ id: cat.id }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});