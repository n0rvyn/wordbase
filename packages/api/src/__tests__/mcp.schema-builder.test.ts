import { describe, it, expect } from 'vitest';
import { z, type ZodTypeAny } from 'zod';
import { buildInputSchema } from '../mcp/schema.js';
import { registerTools } from '../mcp/tools.js';

// ── buildInputSchema: descriptor → Zod shape compiler ───────────────────────
// These pin the compiler contract before mcp/schema.ts exists (Task 1-impl).
// Every case asserts on `.safeParse` results, not just "the key exists" — a
// compiler that returns z.any() for everything would pass a shallower check.

describe('buildInputSchema', () => {
  it('required field: fails when missing, passes when given', () => {
    const shape = buildInputSchema({ title: { type: 'string', required: true } });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: 'hello' }).success).toBe(true);
  });

  it('field without required stays optional (preserves today\'s default)', () => {
    const shape = buildInputSchema({ note: { type: 'string' } });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('enum: rejects values outside the set, accepts values inside it', () => {
    const shape = buildInputSchema({
      status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({ status: 'bogus' }).success).toBe(false);
    expect(schema.safeParse({ status: 'draft' }).success).toBe(true);
  });

  it('boolean: accepts true, and coerces legacy 0/1 numeric callers into real booleans', () => {
    const shape = buildInputSchema({ explicit: { type: 'boolean' } });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({ explicit: true }).success).toBe(true);

    const coerced = schema.safeParse({ explicit: 1 });
    expect(coerced.success).toBe(true);
    if (coerced.success) expect(coerced.data.explicit).toBe(true);
  });

  // Regression: the array branch used to read only `def.items` and silently
  // drop `def.enum`, so analytics_query's `sections` advertised a four-value
  // enum it never enforced — a typo'd section reached the handler as a plain
  // string and the tool answered {} with no isError. The string branch always
  // honoured enum; only the array branch did not.
  it('array with enum: rejects an element outside the set, accepts one inside', () => {
    const shape = buildInputSchema({
      sections: {
        type: 'array',
        items: 'string',
        enum: ['overview', 'top_posts', 'trends', 'content_stats'],
      },
    });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({ sections: ['not_a_section'] }).success).toBe(false);
    expect(schema.safeParse({ sections: ['overview', 'trends'] }).success).toBe(true);
    // The comma-string compat path must be constrained by the enum too.
    expect(schema.safeParse({ sections: 'overview,bogus' }).success).toBe(false);
    expect(schema.safeParse({ sections: 'overview,trends' }).success).toBe(true);
  });

  it('array: accepts a real array, and normalizes a comma-string into one', () => {
    const shape = buildInputSchema({ tagIds: { type: 'array', items: 'string' } });
    const schema = shapeToObject(shape);

    const arrayResult = schema.safeParse({ tagIds: ['a', 'b'] });
    expect(arrayResult.success).toBe(true);
    if (arrayResult.success) expect(arrayResult.data.tagIds).toEqual(['a', 'b']);

    const csvResult = schema.safeParse({ tagIds: 'a,b' });
    expect(csvResult.success).toBe(true);
    if (csvResult.success) expect(csvResult.data.tagIds).toEqual(['a', 'b']);
  });

  // Task 9 backward-compat extension: object-shaped array items (e.g.
  // i18n_put_cache.entries) can't be normalized via comma-split like a plain
  // string array can — a JSON-encoded array literal must be parsed as JSON
  // instead, so old callers that still send `JSON.stringify([...])` keep
  // working once the descriptor moves from `string` to `array`.
  it('array with object items: parses a bracket-prefixed JSON array string', () => {
    const shape = buildInputSchema({
      entries: {
        type: 'array',
        items: z.object({ sourceHash: z.string(), lang: z.string() }),
      },
    });
    const schema = shapeToObject(shape);

    const real = schema.safeParse({ entries: [{ sourceHash: 'h1', lang: 'en' }] });
    expect(real.success).toBe(true);
    if (real.success) expect(real.data.entries).toEqual([{ sourceHash: 'h1', lang: 'en' }]);

    const jsonString = schema.safeParse({
      entries: JSON.stringify([{ sourceHash: 'h1', lang: 'en' }]),
    });
    expect(jsonString.success).toBe(true);
    if (jsonString.success) expect(jsonString.data.entries).toEqual([{ sourceHash: 'h1', lang: 'en' }]);

    // A non-bracket, non-JSON string falls through to comma-split, producing
    // a single-element array of a plain string — which then fails to match
    // the object item shape as a normal (non-thrown) Zod validation error.
    const malformed = schema.safeParse({ entries: '{not valid json' });
    expect(malformed.success).toBe(false);
  });

  it('number: enforces min/max bounds', () => {
    const shape = buildInputSchema({ limit: { type: 'number', min: 1, max: 100 } });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ limit: 101 }).success).toBe(false);
    expect(schema.safeParse({ limit: 10 }).success).toBe(true);
  });

  it('unknown type throws at compile time instead of silently degrading to string', () => {
    expect(() => buildInputSchema({ x: { type: 'bogus' as any } })).toThrow();
  });

  it('object without shape: keeps caller-defined keys instead of stripping them (free-form map)', () => {
    const shape = buildInputSchema({ links: { type: 'object' } });
    const schema = shapeToObject(shape);
    const result = schema.safeParse({ links: { twitter: 'https://x.com/foo', github: 'https://github.com/foo' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.links).toEqual({ twitter: 'https://x.com/foo', github: 'https://github.com/foo' });
    }
  });

  it('object with shape: still validates against the fixed field set', () => {
    const shape = buildInputSchema({
      feature: { type: 'object', shape: { icon: { type: 'string' }, title: { type: 'string', required: true } } },
    });
    const schema = shapeToObject(shape);
    expect(schema.safeParse({ feature: { title: 'Fast' } }).success).toBe(true);
    expect(schema.safeParse({ feature: {} }).success).toBe(false);
  });
});

// Helper: wrap a compiled shape in a z.object so we can .safeParse against it.
function shapeToObject(shape: Record<string, ZodTypeAny>) {
  return z.object(shape);
}

// ── shim emission: registerTool vs tool() fallback ──────────────────────────

describe('registerTools — shim emission via registerTool', () => {
  // The double models the real McpServer shape: it has BOTH `tool` and
  // `registerTool`. If the shim's registerTool-detection branch were broken
  // and it fell through to calling `tool()` instead, this double still has a
  // `tool` method (so no TypeError masks the bug) and the `toolCalls` array
  // lets us assert that fallback path was never taken.
  function buildRegisterToolDouble() {
    const registered = new Map<string, { config: any; handler: any }>();
    const toolCalls: string[] = [];
    return {
      tool(name: string, ..._rest: unknown[]) {
        toolCalls.push(name);
      },
      registerTool(name: string, config: any, handler: any) {
        registered.set(name, { config, handler });
      },
      getRegistered(name: string) {
        return registered.get(name);
      },
      getToolCalls() {
        return toolCalls;
      },
    };
  }

  it('emits via registerTool (not tool) with description + inputSchema in config', () => {
    const double = buildRegisterToolDouble();
    registerTools(double, ['*']);
    const postList = double.getRegistered('post_list');
    expect(postList).toBeDefined();
    expect(typeof postList!.config.description).toBe('string');
    expect(postList!.config.inputSchema).toBeDefined();
    // Discriminates the branch: when registerTool is available, tool() must
    // never be called as a fallback.
    expect(double.getToolCalls()).toEqual([]);
  });

  it('post_list (known read-only tool) carries annotations.readOnlyHint === true', () => {
    const double = buildRegisterToolDouble();
    registerTools(double, ['*']);
    const postList = double.getRegistered('post_list');
    expect(postList!.config.annotations?.readOnlyHint).toBe(true);
  });

  it('post_delete (known destructive tool) carries annotations.destructiveHint === true', () => {
    const double = buildRegisterToolDouble();
    registerTools(double, ['*']);
    const postDelete = double.getRegistered('post_delete');
    expect(postDelete!.config.annotations?.destructiveHint).toBe(true);
  });

  it('post_list and post_delete both carry a non-empty title string', () => {
    const double = buildRegisterToolDouble();
    registerTools(double, ['*']);
    const postList = double.getRegistered('post_list');
    const postDelete = double.getRegistered('post_delete');
    expect(typeof postList!.config.title).toBe('string');
    expect(postList!.config.title.length).toBeGreaterThan(0);
    expect(typeof postDelete!.config.title).toBe('string');
    expect(postDelete!.config.title.length).toBeGreaterThan(0);
  });
});

// ── fallback path: doubles without registerTool must keep working ──────────
// Mirrors the buildFakeServer() shape used by mcp.tools.test.ts and the other
// 8 existing test files — none of them define registerTool, so the shim must
// still route to their plain tool() method.

describe('registerTools — tool() fallback for doubles without registerTool', () => {
  function buildFakeServer() {
    const names: string[] = [];
    return {
      tool(name: string, _desc: string, _schema: unknown, _handler: unknown) {
        names.push(name);
      },
      getNames() {
        return names;
      },
    };
  }

  it('registers the full tool set via tool() when registerTool is absent', () => {
    const server = buildFakeServer();
    registerTools(server, ['*']);
    const names = server.getNames();
    expect(names).toContain('post_list');
    expect(names).toContain('post_delete');
    expect(names.length).toBeGreaterThan(30);
  });
});
