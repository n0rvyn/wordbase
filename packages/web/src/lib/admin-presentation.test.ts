import { describe, it, expect } from 'vitest';
import {
  buildLabel,
  shortUtc,
  postFilter,
  observationTab,
  observationKeys,
} from './admin-presentation';
describe('human console presentation', () => {
  it('labels missing build records separately from an actual successful or failed build', () => {
    expect(buildLabel(undefined)).toBe('Unavailable');
    expect(buildLabel('idle')).toBe('Not recorded');
    expect(buildLabel('success')).toBe('Succeeded');
    expect(buildLabel('failed')).toBe('Failed');
  });
  it('keeps UTC explicit in human-readable times and preserves epoch zero', () => {
    expect(shortUtc(0)).toContain('1 Jan');
    expect(shortUtc(0)).toContain('UTC');
    expect(shortUtc(null)).toBe('Not recorded');
    expect(shortUtc(NaN)).toBe('Not recorded');
    expect(shortUtc(1e20)).toBe('Not recorded');
    expect(shortUtc(0)).toContain('1970');
  });
  it('opens the real draft filter and rejects unrecognized statuses', () => {
    expect(postFilter('?status=draft')).toBe('draft');
    expect(postFilter('?status=published')).toBe('published');
    expect(postFilter('?status=archived')).toBe('archived');
    expect(postFilter('?status=invalid')).toBe('');
    expect(postFilter('')).toBe('');
  });
  it('routes build details to operations and preserves existing tab keys', () => {
    expect(observationTab('#health')).toBe('health');
    expect(observationTab('#seo')).toBe('seo');
    expect(observationTab('#quality')).toBe('quality');
    expect(observationTab('#posts')).toBe('posts');
    expect(observationTab('#audience')).toBe('audience');
    expect(observationTab('#invalid')).toBe('audience');
  });
  it('loads only the active view without dropping any existing measurement', () => {
    expect(observationKeys.health).toEqual(['requests', 'system']);
    expect(observationKeys.seo).toEqual(['seo-health']);
    expect(observationKeys.audience).not.toContain('system');
    expect(new Set(Object.values(observationKeys).flat()).size).toBe(16);
  });
});
