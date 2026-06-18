import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postTags, postCategories, posts, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';
import { createPost } from '../services/post.service.js';

// MUST-FIX-2 (verifier): Task 4 build-decision tests must use a partial mock
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

describe('tag_update MCP tool — scope', () => {
  it('is registered with tags:write scope', () => {
    expect(TOOL_SCOPES.tag_update).toBe('tags:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('tag_update');
  });
});

describe('category_update MCP tool — scope', () => {
  it('is registered with categories:write scope', () => {
    expect(TOOL_SCOPES.category_update).toBe('categories:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('category_update');
  });
});

describe('tag_update MCP tool — behavior', () => {
  it('renames a tag and persists the change', async () => {
    const tag = await createTag({ name: 'old-name' });
    const handler = server.getHandler('tag_update')!;

    const result = await handler({ id: tag.id, name: 'new-name' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();

    const row = JSON.parse(result.content[0].text) as { id: string; name: string; slug: string };
    expect(row.id).toBe(tag.id);
    expect(row.name).toBe('new-name');
    expect(row.slug).toBe('old-name'); // slug not touched when only name updated

    // Verify it persisted via direct DB read (slug stayed "old-name" because we
    // only renamed — createTag would derive a NEW slug from "new-name" and
    // insert a second row, not return the existing one).
    const refreshed = await db.select().from(tags).where(eq(tags.id, tag.id));
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].name).toBe('new-name');
    expect(refreshed[0].slug).toBe('old-name');
  });

  it('updates the slug when slug is given', async () => {
    const tag = await createTag({ name: 'display' });
    const handler = server.getHandler('tag_update')!;

    const result = await handler({ id: tag.id, slug: 'custom-slug' }) as { content: { text: string }[] };
    const row = JSON.parse(result.content[0].text) as { slug: string; name: string };
    expect(row.slug).toBe('custom-slug');
    expect(row.name).toBe('display'); // name untouched
  });

  it('returns isError for an unknown tag id (not a thrown exception)', async () => {
    const handler = server.getHandler('tag_update')!;
    const result = await handler({ id: 'nonexistent-id', name: 'whatever' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('returns isError (not a raw throw) when an explicit slug collides (G-1)', async () => {
    await createTag({ name: 'taken', slug: 'taken-slug' });
    const other = await createTag({ name: 'other', slug: 'other-slug' });
    const handler = server.getHandler('tag_update')!;

    const result = await handler({ id: other.id, slug: 'taken-slug' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/slug already exists/i);
  });
});

describe('tag_update MCP tool — build decision (DP-004)', () => {
  it('triggers a rebuild when the tag is attached to a published post', async () => {
    const tag = await createTag({ name: 'published-tag' });
    const post = await createPost({ title: 'Live', content: 'b', status: 'published' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });

    const handler = server.getHandler('tag_update')!;
    const result = await handler({ id: tag.id, name: 'published-tag-renamed' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger a rebuild when the tag is only attached to drafts', async () => {
    const tag = await createTag({ name: 'drafts-only-tag' });
    const draft = await createPost({ title: 'WIP', content: 'b', status: 'draft' });
    await db.insert(postTags).values({ postId: draft.id, tagId: tag.id });

    const handler = server.getHandler('tag_update')!;
    const result = await handler({ id: tag.id, name: 'renamed' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger a rebuild when the tag has no posts attached', async () => {
    const tag = await createTag({ name: 'lonely-tag' });

    const handler = server.getHandler('tag_update')!;
    const result = await handler({ id: tag.id, name: 'still-lonely' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});

describe('category_update MCP tool — behavior', () => {
  it('renames a category and persists the change', async () => {
    const cat = await createCategory({ name: 'old-cat' });
    const handler = server.getHandler('category_update')!;

    const result = await handler({ id: cat.id, name: 'new-cat' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();

    const row = JSON.parse(result.content[0].text) as { id: string; name: string; slug: string };
    expect(row.id).toBe(cat.id);
    expect(row.name).toBe('new-cat');
    expect(row.slug).toBe('old-cat');
  });

  it('updates slug, description, and sortOrder when given', async () => {
    const cat = await createCategory({ name: 'a', description: 'd', sortOrder: 1 });
    const handler = server.getHandler('category_update')!;

    const result = await handler({
      id: cat.id,
      slug: 'b',
      description: 'd2',
      sortOrder: 9,
    }) as { content: { text: string }[] };
    const row = JSON.parse(result.content[0].text) as { slug: string; description: string; sortOrder: number };
    expect(row.slug).toBe('b');
    expect(row.description).toBe('d2');
    expect(row.sortOrder).toBe(9);
  });

  it('returns isError for an unknown category id', async () => {
    const handler = server.getHandler('category_update')!;
    const result = await handler({ id: 'nonexistent-id', name: 'whatever' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('returns isError (not a raw throw) when an explicit slug collides (G-1)', async () => {
    await createCategory({ name: 'taken', slug: 'taken-slug' });
    const other = await createCategory({ name: 'other', slug: 'other-slug' });
    const handler = server.getHandler('category_update')!;

    const result = await handler({ id: other.id, slug: 'taken-slug' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/slug already exists/i);
  });
});

describe('category_update MCP tool — build decision (DP-004)', () => {
  it('triggers a rebuild when the category is attached to a published post', async () => {
    const cat = await createCategory({ name: 'published-cat' });
    const post = await createPost({ title: 'Live', content: 'b', status: 'published' });
    await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });

    const handler = server.getHandler('category_update')!;
    const result = await handler({ id: cat.id, name: 'published-cat-renamed' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger a rebuild when the category is only attached to drafts', async () => {
    const cat = await createCategory({ name: 'drafts-only-cat' });
    const draft = await createPost({ title: 'WIP', content: 'b', status: 'draft' });
    await db.insert(postCategories).values({ postId: draft.id, categoryId: cat.id });

    const handler = server.getHandler('category_update')!;
    const result = await handler({ id: cat.id, name: 'renamed' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger a rebuild when the category has no posts attached', async () => {
    const cat = await createCategory({ name: 'lonely-cat' });

    const handler = server.getHandler('category_update')!;
    const result = await handler({ id: cat.id, name: 'still-lonely' }) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(triggerBuildSpy).not.toHaveBeenCalled();
  });
});