import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postTags, postCategories, posts, tags, categories } from '../db/schema.js';
import { TOOL_SCOPES, registerTools } from '../mcp/tools.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

// Phase 3 — taxonomy create tools. Mirror the mcp.taxonomy-list pattern
// (capture handlers via a stub server, hit the handler directly to assert
// return shape). Scopes are checked via TOOL_SCOPES.

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

describe('tag_create MCP tool — scope', () => {
  it('is registered with tags:write scope', () => {
    expect(TOOL_SCOPES.tag_create).toBe('tags:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('tag_create');
  });
});

describe('category_create MCP tool — scope', () => {
  it('is registered with categories:write scope', () => {
    expect(TOOL_SCOPES.category_create).toBe('categories:write');
  });

  it('is registered in the tool name list', () => {
    expect(server.getNames()).toContain('category_create');
  });
});

describe('tag_create MCP tool — behavior', () => {
  it('creates a tag with an auto-derived slug and returns the row', async () => {
    const handler = server.getHandler('tag_create')!;
    const result = await handler({ name: 'typescript' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const row = JSON.parse(result.content[0].text) as { id: string; slug: string; name: string };
    expect(row.name).toBe('typescript');
    expect(row.slug).toBe('typescript');
    expect(row.id).toBeTruthy();

    const stored = await db.select().from(tags).where(eq(tags.id, row.id));
    expect(stored).toHaveLength(1);
  });

  it('is idempotent: posting the same name twice returns the same tag (create-or-attach)', async () => {
    const handler = server.getHandler('tag_create')!;

    const first = await handler({ name: 'ai-notes' }) as { content: { text: string }[] };
    const firstRow = JSON.parse(first.content[0].text) as { id: string };

    const second = await handler({ name: 'ai-notes' }) as { content: { text: string }[]; isError?: boolean };
    expect(second.isError).toBeUndefined();
    const secondRow = JSON.parse(second.content[0].text) as { id: string };

    expect(secondRow.id).toBe(firstRow.id);
    const all = await db.select().from(tags);
    expect(all).toHaveLength(1);
  });

  it('respects an explicit slug override', async () => {
    const handler = server.getHandler('tag_create')!;
    const result = await handler({ name: 'Display Name', slug: 'custom-slug' }) as { content: { text: string }[] };
    const row = JSON.parse(result.content[0].text) as { slug: string };

    expect(row.slug).toBe('custom-slug');
  });
});

describe('category_create MCP tool — behavior', () => {
  it('creates a category and returns the row (ASCII slug)', async () => {
    const handler = server.getHandler('category_create')!;
    const result = await handler({ name: 'essays' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const row = JSON.parse(result.content[0].text) as { id: string; slug: string; name: string };
    expect(row.name).toBe('essays');
    expect(row.slug).toBe('essays');
    expect(row.id).toBeTruthy();

    const stored = await db.select().from(categories).where(eq(categories.id, row.id));
    expect(stored).toHaveLength(1);
  });

  it('CJK name produces a non-empty slug (DP-005 regression through MCP path)', async () => {
    const handler = server.getHandler('category_create')!;
    const result = await handler({ name: '技术随笔' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const row = JSON.parse(result.content[0].text) as { slug: string };
    expect(row.slug).toBeTruthy();
    expect(row.slug).not.toBe('');
  });

  it('two different Chinese categories do not collide on the unique slug constraint', async () => {
    const handler = server.getHandler('category_create')!;
    const a = await handler({ name: '技术随笔' }) as { content: { text: string }[] };
    const b = await handler({ name: '生活' }) as { content: { text: string }[]; isError?: boolean };

    expect(b.isError).toBeUndefined();
    const rowA = JSON.parse(a.content[0].text) as { id: string; slug: string };
    const rowB = JSON.parse(b.content[0].text) as { id: string; slug: string };
    expect(rowA.id).not.toBe(rowB.id);
  });

  it('accepts optional description and sortOrder', async () => {
    const handler = server.getHandler('category_create')!;
    const result = await handler({ name: 'ordered', description: 'desc', sortOrder: 5 }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const row = JSON.parse(result.content[0].text) as { description: string; sortOrder: number };
    expect(row.description).toBe('desc');
    expect(row.sortOrder).toBe(5);
  });

  it('duplicate slug returns isError (not a thrown exception) — category is not create-or-attach', async () => {
    // Seed an existing category with a known slug
    await createCategory({ name: 'taken', slug: 'taken-slug' });

    const handler = server.getHandler('category_create')!;
    const result = await handler({ name: 'different-name', slug: 'taken-slug' }) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/already exists|UNIQUE/i);
  });
});