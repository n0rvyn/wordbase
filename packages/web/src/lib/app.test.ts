import { describe, it, expect } from 'vitest';
import {
  shade,
  parseJsonArray,
  appColors,
  buildMetaCells,
  descriptionParagraphs,
  formatYear,
} from './app';

// ─── shade ────────────────────────────────────────────────────────────────────

describe('shade', () => {
  it('darkens #0CA8E5 by -28% to exactly #0979a5', () => {
    // r=12·.72→9, g=168·.72→121=0x79, b=229·.72→165=0xa5
    expect(shade('#0CA8E5', -28)).toBe('#0979a5');
  });

  it('returns invalid hex input unchanged', () => {
    expect(shade('not-a-hex', -28)).toBe('not-a-hex');
  });

  it('returns short hex input unchanged', () => {
    expect(shade('#0CA', -28)).toBe('#0CA');
  });

  it('lightens a colour (positive pct)', () => {
    // pct > 0: c + (255-c)*f. Just check it produces a valid hex string.
    const result = shade('#333333', 50);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#333333');
  });
});

// ─── parseJsonArray ───────────────────────────────────────────────────────────

describe('parseJsonArray', () => {
  it('returns [] for null', () => {
    expect(parseJsonArray(null)).toEqual([]);
  });

  it('parses a valid JSON array', () => {
    const result = parseJsonArray<{ a: number }>('[{"a":1}]');
    expect(result).toHaveLength(1);
    expect(result[0].a).toBe(1);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseJsonArray('garbage')).toEqual([]);
  });

  it('returns [] for a JSON non-array (object)', () => {
    expect(parseJsonArray('{"a":1}')).toEqual([]);
  });

  it('returns [] for a JSON non-array (string)', () => {
    expect(parseJsonArray('"hello"')).toEqual([]);
  });
});

// ─── appColors ────────────────────────────────────────────────────────────────

describe('appColors', () => {
  it('derives app2 from accentColor (exact literal, not tautological)', () => {
    const { app, app2 } = appColors('#0CA8E5');
    expect(app).toBe('#0CA8E5');
    expect(app2).toBe('#0979a5');
  });

  it('falls back to site accent when accentColor is null', () => {
    const { app } = appColors(null);
    expect(app).toBe('#3457B6');
  });

  it('uses custom siteAccent when provided', () => {
    const { app } = appColors(null, '#aabbcc');
    expect(app).toBe('#aabbcc');
  });
});

// ─── buildMetaCells ───────────────────────────────────────────────────────────

describe('buildMetaCells', () => {
  const base = {
    version: null,
    rating: null,
    ratingCount: null,
    price: null,
    minimumOsVersion: null,
    category: null,
  };

  it('returns empty array when all fields null', () => {
    expect(buildMetaCells(base)).toEqual([]);
  });

  it('omits rating cell when ratingCount is 0', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: 0 });
    expect(cells.find(c => c.k === '评分')).toBeUndefined();
  });

  it('omits rating cell when ratingCount is null', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: null });
    expect(cells.find(c => c.k === '评分')).toBeUndefined();
  });

  it('includes rating cell when ratingCount is non-zero', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: 1200 });
    const cell = cells.find(c => c.k === '评分');
    expect(cell).toBeDefined();
    expect(cell?.star).toBe(true);
  });

  it('includes version cell with v prefix', () => {
    const cells = buildMetaCells({ ...base, version: '1.0' });
    expect(cells.find(c => c.k === '版本')?.v).toBe('v1.0');
  });

  it('extracts last segment of dotted category', () => {
    const cells = buildMetaCells({ ...base, category: '效率 · Productivity' });
    expect(cells.find(c => c.k === '分类')?.v).toBe('Productivity');
  });

  it('uses plain category string when no dot separator', () => {
    const cells = buildMetaCells({ ...base, category: 'Productivity' });
    expect(cells.find(c => c.k === '分类')?.v).toBe('Productivity');
  });

  it('omits cells for null version, price, minOS, category', () => {
    const cells = buildMetaCells(base);
    const keys = cells.map(c => c.k);
    expect(keys).not.toContain('版本');
    expect(keys).not.toContain('价格');
    expect(keys).not.toContain('系统要求');
    expect(keys).not.toContain('分类');
  });
});

// ─── descriptionParagraphs ────────────────────────────────────────────────────

describe('descriptionParagraphs', () => {
  it('returns [] for null', () => {
    expect(descriptionParagraphs(null)).toEqual([]);
  });

  it('splits on blank lines and trims', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = descriptionParagraphs(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('First paragraph.');
    expect(result[1]).toBe('Second paragraph.');
  });

  it('splits the real Delphi-style blob with 【headers】 into ≥2 paragraphs', () => {
    // Synthetic blob that mirrors Delphi format (plain text, 【…】 sections, • bullets)
    const blob = [
      '【语音捕获】\n语音捕获让你用声音快速记录想法。\n• 支持实时转录\n• 多语言识别',
      '',
      '【关联思考】\n自动发现想法之间的联系，构建知识网络。',
      '',
      '订阅说明\nhttps://example.notion.site/privacy-policy',
    ].join('\n');

    const paras = descriptionParagraphs(blob);
    expect(paras.length).toBeGreaterThanOrEqual(2);
    expect(paras.some(p => p.includes('【语音捕获】'))).toBe(true);
  });

  it('drops empty paragraphs', () => {
    const input = 'A\n\n\n\nB';
    expect(descriptionParagraphs(input)).toHaveLength(2);
  });
});

// ─── formatYear ───────────────────────────────────────────────────────────────

describe('formatYear', () => {
  it('returns null for null input', () => {
    expect(formatYear(null)).toBeNull();
  });

  it('returns a 4-digit year for a known timestamp', () => {
    // 2024-04-29 00:00:00 UTC → year 2024
    const ts = 1714377600;
    expect(formatYear(ts)).toBe(2024);
  });

  it('returns a number (not a string)', () => {
    expect(typeof formatYear(1700000000)).toBe('number');
  });
});
