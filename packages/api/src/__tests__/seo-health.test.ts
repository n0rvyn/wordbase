import { describe, it, expect } from 'vitest';
import { getSeoHealth } from '../services/seo-health.service.js';

describe('getSeoHealth', () => {
  it('returns the documented artifact structure (sitemap/robots/blogFeed/llmsTxt)', () => {
    const r = getSeoHealth();
    expect(r.artifacts).toBeTypeOf('object');
    expect(r.artifacts.sitemap).toBeTypeOf('object');
    expect(r.artifacts.sitemap).toHaveProperty('exists');
    expect(r.artifacts.sitemap).toHaveProperty('urlCount');
    expect(r.artifacts.sitemap).toHaveProperty('canonicalHost');
    expect(r.artifacts.robots).toBeTypeOf('object');
    expect(r.artifacts.robots).toHaveProperty('exists');
    expect(r.artifacts.blogFeed).toBeTypeOf('object');
    expect(r.artifacts.blogFeed).toHaveProperty('exists');
    expect(r.artifacts.llmsTxt).toBeTypeOf('object');
    expect(r.artifacts.llmsTxt).toHaveProperty('exists');
  });

  it('returns the coverage counters as numbers', () => {
    const r = getSeoHealth();
    expect(r.coverage).toBeTypeOf('object');
    expect(typeof r.coverage.postsTotal).toBe('number');
    expect(typeof r.coverage.postsWithAuthoredExcerpt).toBe('number');
    expect(typeof r.coverage.postsWithCustomCover).toBe('number');
  });

  it('returns issues as a string array (never throws on missing dist files)', () => {
    const r = getSeoHealth();
    expect(Array.isArray(r.issues)).toBe(true);
    for (const issue of r.issues) {
      expect(typeof issue).toBe('string');
    }
  });

  it('does not throw when invoked (dist may or may not exist; both states must be tolerated)', () => {
    expect(() => getSeoHealth()).not.toThrow();
  });
});
