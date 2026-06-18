import { describe, it, expect } from 'vitest';
import { TOOL_SCOPES } from '../mcp/tools.js';

describe('post_search MCP tool scope', () => {
  it('is registered with posts:read scope (matches REST published-read parity)', () => {
    expect(TOOL_SCOPES.post_search).toBe('posts:read');
  });

  it('is classified as a read-only scope (not posts:write)', () => {
    expect(TOOL_SCOPES.post_search).not.toBe('posts:write');
  });
});
