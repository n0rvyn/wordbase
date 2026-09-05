import { describe, it, expect } from 'vitest';
import type { ZodTypeAny } from 'zod';
import { registerTools, TOOL_SCOPES, REGISTERED_DESCRIPTORS } from '../mcp/tools.js';
import type { PropDescriptor } from '../mcp/schema.js';

// Task 10: a single mechanical contract that every registered MCP tool must
// satisfy, so a newly added tool that forgets scope/title/annotations/a
// description fails loudly here instead of surfacing as a real client
// mis-registration or (worse) an accidental scope hole.

// Double that mirrors the real McpServer shape used by mcp.schema-builder.test.ts
// — has BOTH `tool` and `registerTool` so the shim always takes the
// registerTool branch, and records every registration for inspection.
function buildRegisterToolDouble() {
  const registered = new Map<string, { config: any; handler: any }>();
  return {
    tool(_name: string, ..._rest: unknown[]) {
      // Should never be hit — registerTool is present on this double.
    },
    registerTool(name: string, config: any, handler: any) {
      registered.set(name, { config, handler });
    },
    getRegistered(name: string) {
      return registered.get(name);
    },
    allNames() {
      return [...registered.keys()];
    },
  };
}

// Segment-based, name-derived read-only/destructive expectations — matched by
// underscore-separated segment, not just suffix, per Task 10 step 1 (a
// suffix-only check would miss verb-in-the-middle names like blog_list_media
// or podcast_get_episode).
const READ_ONLY_SEGMENTS = new Set([
  'list', 'get', 'search', 'status', 'pending', 'render', 'query', 'analytics', 'stats',
]);
const DESTRUCTIVE_SEGMENTS = new Set(['delete']);

describe('mcp.tool-contract — mechanical contract for every registered tool', () => {
  const double = buildRegisterToolDouble();
  registerTools(double, ['*']);
  const names = double.allNames();

  it('registers at least the known tool count (sanity check the double worked)', () => {
    expect(names.length).toBeGreaterThan(30);
  });

  it('every registered tool has a TOOL_SCOPES entry', () => {
    for (const name of names) {
      expect(TOOL_SCOPES[name], `${name} is registered but has no TOOL_SCOPES entry`).toBeTruthy();
    }
  });

  it('no orphan TOOL_SCOPES entries (every scoped name is actually registered under ["*"])', () => {
    for (const scopedName of Object.keys(TOOL_SCOPES)) {
      expect(names, `TOOL_SCOPES has "${scopedName}" but it never registered`).toContain(scopedName);
    }
  });

  it.each(names)('%s: has a non-empty title distinct from the tool name', (name) => {
    const config = double.getRegistered(name)!.config;
    expect(typeof config.title).toBe('string');
    expect(config.title.length).toBeGreaterThan(0);
    expect(config.title).not.toBe(name);
  });

  it.each(names)('%s: annotations exist with readOnlyHint and destructiveHint explicit', (name) => {
    const config = double.getRegistered(name)!.config;
    expect(config.annotations).toBeDefined();
    expect(config.annotations.readOnlyHint).not.toBeUndefined();
    expect(config.annotations.destructiveHint).not.toBeUndefined();
  });

  it.each(names)('%s: name-derived read-only/destructive hint matches its segments', (name) => {
    const config = double.getRegistered(name)!.config;
    const segments = name.split('_');
    if (segments.some((s) => READ_ONLY_SEGMENTS.has(s))) {
      expect(config.annotations.readOnlyHint, `${name} looks read-only by name but readOnlyHint !== true`).toBe(true);
    }
    if (segments.some((s) => DESTRUCTIVE_SEGMENTS.has(s))) {
      expect(config.annotations.destructiveHint, `${name} looks destructive by name but destructiveHint !== true`).toBe(true);
    }
  });

  it.each(names)('%s: description is at least 30 characters (not a one-liner LLM contract)', (name) => {
    const config = double.getRegistered(name)!.config;
    expect(typeof config.description).toBe('string');
    expect(config.description.length).toBeGreaterThanOrEqual(30);
  });

  it.each(names)('%s: every input field has a .description', (name) => {
    const config = double.getRegistered(name)!.config;
    const shape: Record<string, ZodTypeAny> = config.inputSchema ?? {};
    for (const [field, zodType] of Object.entries(shape)) {
      expect((zodType as any).description, `${name}.${field} has no .describe()`).toBeTruthy();
    }
  });

  it.each(names)('%s: required descriptor fields stay required after compilation (no drift)', (name) => {
    const config = double.getRegistered(name)!.config;
    const rawShape: Record<string, PropDescriptor> | undefined = REGISTERED_DESCRIPTORS.get(name);
    expect(rawShape, `${name} has no entry in REGISTERED_DESCRIPTORS`).toBeDefined();
    const compiledShape: Record<string, ZodTypeAny> = config.inputSchema ?? {};
    for (const [field, descriptor] of Object.entries(rawShape!)) {
      if (descriptor.required === true) {
        const compiled = compiledShape[field];
        expect(compiled, `${name}.${field} is marked required but missing from compiled schema`).toBeDefined();
        expect(
          (compiled as any).isOptional(),
          `${name}.${field} is marked required in the descriptor but optional() after compilation`,
        ).toBe(false);
      }
    }
  });
});
