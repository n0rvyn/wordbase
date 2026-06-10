import { describe, it, expect } from 'vitest';
import { generateSlug } from '../lib/slug.js';

const ASCII = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // lowercase, digits, single hyphens, no leading/trailing/doubled

describe('generateSlug', () => {
  it('converts a CJK title to toneless pinyin, ASCII-only, no percent-encoding', () => {
    const s = generateSlug('内容工业的空心化：当 AI 生产了一堆空气');
    expect(s).toMatch(ASCII);
    expect(s.startsWith('nei-rong-gong-ye')).toBe(true);
    expect(s).not.toContain('%');
    expect(s.length).toBeLessThanOrEqual(50);
  });

  it('passes through an English title (lowercased, hyphenated)', () => {
    expect(generateSlug('Enabling iPhone Tethering over USB')).toBe(
      'enabling-iphone-tethering-over-usb'
    );
  });

  it('keeps non-CJK runs (acronyms) inside a mixed title', () => {
    const s = generateSlug('什么是DBOS？这与我何干？');
    expect(s).toMatch(ASCII);
    expect(s).toContain('dbos');
    expect(s.endsWith('-')).toBe(false);
  });

  it('preserves digits', () => {
    expect(generateSlug('开发日志1')).toContain('1');
  });

  it('caps length at ~50 chars on a word boundary (no trailing hyphen)', () => {
    const longTitle = '这是一个非常非常非常非常非常非常长的中文标题用来测试长度截断行为是否正确';
    const s = generateSlug(longTitle);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith('-')).toBe(false);
    expect(s).toMatch(ASCII);
  });

  it('dedupes collisions with an incrementing numeric suffix', () => {
    expect(generateSlug('内容', { existing: new Set(['nei-rong']) })).toBe('nei-rong-2');
    expect(
      generateSlug('内容', { existing: new Set(['nei-rong', 'nei-rong-2']) })
    ).toBe('nei-rong-3');
  });

  it('falls back to the id when the title yields an empty slug, never empty', () => {
    const s = generateSlug('', { fallbackId: 'V1StGXR8' });
    expect(s).toBe('v1stgxr8');
    expect(generateSlug('！！！', { fallbackId: 'abc123' })).toBe('abc123');
    expect(generateSlug('').length).toBeGreaterThan(0); // ultimate fallback 'post'
  });
});
