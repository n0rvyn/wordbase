import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { postTags, postCategories, posts, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';
import { createPost } from '../services/post.service.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

// Phase 3 — taxonomy list tools. Mirror the mcp.post-update.test pattern
// (capture handlers via a stub server, hit the handler directly to assert
// return shape + count). Scopes are checked via TOOL_SCOPES.

// resetNewTables() does NOT cover tags/categories/post_tags/post_categories/
// posts, so each test cleans up explicitly (plan MUST-FIX-1).
afterEach(async () => {
  await db.delete(postTags);
  await db.delete(postCategories);
  await db.delete(posts);
  await db.delete(tags);
  await db.delete(categories);
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

describe('tag_list MCP tool — scope', () => {
  it('is registered with tags:read scope', () => {
    expect(TOOL_SCOPES.tag_list).toBe('tags:read');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('tag_list');
  });
});

describe('category_list MCP tool — scope', () => {
  it('is registered with categories:read scope', () => {
    expect(TOOL_SCOPES.category_list).toBe('categories:read');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('category_list');
  });
});

describe('tag_list MCP tool — postCount', () => {
  it('reports the number of posts attached to each tag', async () => {
    const tag = await createTag({ name: 'typescript' });
    const lonely = await createTag({ name: 'lonely' });

    // 2 posts reference `tag`
    for (let i = 0; i < 2; i++) {
      const post = await createPost({ title: `P${i}`, content: 'b' });
      await db.insert(postTags).values({ postId: post.id, tagId: tag.id });
    }

    const handler = server.getHandler('tag_list')!;
    const result = await handler({}) as { content: { text: string }[] };
    const rows = JSON.parse(result.content[0].text) as Array<{ id: string; slug: string; name: string; postCount: number }>;

    const tagRow = rows.find(r => r.id === tag.id);
    const lonelyRow = rows.find(r => r.id === lonely.id);

    expect(tagRow).toBeDefined();
    expect(tagRow?.postCount).toBe(2);
    expect(lonelyRow?.postCount).toBe(0);
  });
});

describe('category_list MCP tool — postCount', () => {
  it('reports the number of posts in each category', async () => {
    const cat = await createCategory({ name: 'essays' });
    const empty = await createCategory({ name: 'empty-cat' });

    for (let i = 0; i < 2; i++) {
      const post = await createPost({ title: `P${i}`, content: 'b' });
      await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });
    }

    const handler = server.getHandler('category_list')!;
    const result = await handler({}) as { content: { text: string }[] };
    const rows = JSON.parse(result.content[0].text) as Array<{ id: string; slug: string; name: string; postCount: number }>;

    const catRow = rows.find(r => r.id === cat.id);
    const emptyRow = rows.find(r => r.id === empty.id);

    expect(catRow).toBeDefined();
    expect(catRow?.postCount).toBe(2);
    expect(emptyRow?.postCount).toBe(0);
  });
});