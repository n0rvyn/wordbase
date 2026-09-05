import { describe, it, expect, vi } from 'vitest';
import { registerTools } from '../mcp/tools.js';

// analytics_query is one of two multiplexer tools produced by the DP-004 merge
// (the other is observability_query). Its handler used to drop an unrecognised
// section silently — `sections.includes(s)` is false for a typo, every branch
// resolves to undefined, and the tool returned `{}` with no isError. To an LLM
// caller that reads as "there is no analytics data", not "you misspelled a
// section name", and observability_query rejects the same class of mistake.
//
// The schema's enum (mcp/schema.ts array branch) now rejects a bad section
// before the handler runs, but these tests call the handler DIRECTLY through
// the tool() fallback double — the same path every other mcp.*.test.ts uses,
// which bypasses Zod entirely. That is exactly why the handler keeps its own
// guard: without it, the only protection would be one the tests cannot see.

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function buildCapturingServer() {
  const handlers = new Map<string, Handler>();
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Handler) {
      handlers.set(name, handler);
    },
    getHandler(name: string) {
      return handlers.get(name);
    },
  };
}

vi.mock('../services/analytics.service.js', () => ({
  getOverview: vi.fn(async () => ({ totalPv: 1, todayPv: 2, activePosts: 3 })),
  getTopPosts: vi.fn(async () => [{ id: 'p1', pv: 9 }]),
  getTrends: vi.fn(async () => [{ date: '2026-09-05', pv: 5 }]),
  getContentStats: vi.fn(async () => ({ perMonth: [], tags: [] })),
}));

function handler() {
  const server = buildCapturingServer();
  registerTools(server as never, ['*']);
  return server.getHandler('analytics_query')!;
}

describe('analytics_query unknown-section guard', () => {
  it('returns isError naming the bad section instead of an empty success', async () => {
    const result = await handler()({ sections: ['not_a_section'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not_a_section');
    // The old behaviour: {} with isError undefined. Pin that it is gone.
    expect(result.content[0].text).not.toBe('{}');
  });

  it('names every unknown section, not just the first', async () => {
    const result = await handler()({ sections: ['overview', 'bogus_a', 'bogus_b'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('bogus_a');
    expect(result.content[0].text).toContain('bogus_b');
  });

  it('rejects an explicitly empty sections array rather than answering {}', async () => {
    const result = await handler()({ sections: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toBe('{}');
  });

  it('omitting sections still returns all four sections', async () => {
    const result = await handler()({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(Object.keys(body).sort()).toEqual(['contentStats', 'overview', 'topPosts', 'trends']);
  });

  it('a valid subset returns only the requested sections', async () => {
    const result = await handler()({ sections: ['overview'] });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(Object.keys(body)).toEqual(['overview']);
  });
});
