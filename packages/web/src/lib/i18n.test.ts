import { describe, it, expect } from 'vitest';
import { detectLang, nextLang, t, dict, DEFAULT_LANG, type Lang } from './i18n';

describe('detectLang — three-level guard', () => {
  it('stored pref "en" wins over any navigator.language (Level 1)', () => {
    expect(detectLang({ lang: 'en' }, 'zh-CN')).toBe('en');
    expect(detectLang({ lang: 'en' }, 'en-US')).toBe('en');
  });

  it('stored pref "zh" wins over any navigator.language (Level 1)', () => {
    expect(detectLang({ lang: 'zh' }, 'en-US')).toBe('zh');
    expect(detectLang({ lang: 'zh' }, 'zh-CN')).toBe('zh');
  });

  it('unknown stored value falls through to navigator.language', () => {
    // 'ja' is not 'zh' or 'en' — Level 1 fails → fall through to Level 3.
    expect(detectLang({ lang: 'ja' }, 'en-US')).toBe('en');
    expect(detectLang({ lang: 'ja' }, 'zh-CN')).toBe('zh');
  });

  it('Chinese navigator.language (Level 3 prefix test) → "zh"', () => {
    expect(detectLang({}, 'zh-CN')).toBe('zh');
    expect(detectLang({}, 'zh-TW')).toBe('zh');
    expect(detectLang({}, 'ZH')).toBe('zh');
  });

  it('Non-Chinese navigator.language (Level 3 fallback) → "en"', () => {
    expect(detectLang({}, 'en-US')).toBe('en');
    expect(detectLang({}, 'ja-JP')).toBe('en');
    expect(detectLang({}, 'fr')).toBe('en');
  });

  it('falsy navigator.language returns DEFAULT_LANG ("zh") — Level 2 guard', () => {
    // Locked regression: empty string and undefined MUST both resolve to zh
    // (not "en" via a `'' .toLowerCase().startsWith('zh') === false` fallthrough).
    expect(detectLang({}, undefined)).toBe(DEFAULT_LANG);
    expect(detectLang({}, '')).toBe(DEFAULT_LANG);
  });

  it('DEFAULT_LANG is "zh"', () => {
    expect(DEFAULT_LANG).toBe<Lang>('zh');
  });
});

describe('nextLang', () => {
  it('zh → en', () => {
    expect(nextLang('zh')).toBe<Lang>('en');
  });
  it('en → zh', () => {
    expect(nextLang('en')).toBe<Lang>('zh');
  });
});

describe('t() — missing key fallback', () => {
  it('returns a non-throwing entry with the key echoed in both languages', () => {
    const out = t('__definitely_not_in_dict__');
    expect(out).toEqual({ zh: '__definitely_not_in_dict__', en: '__definitely_not_in_dict__' });
  });
});

describe('dict — completeness', () => {
  it('every entry has non-empty zh and en (no half-translated rows)', () => {
    const offenders: { key: string; reason: string }[] = [];
    for (const [key, entry] of Object.entries(dict)) {
      if (typeof entry.zh !== 'string' || entry.zh.trim() === '') {
        offenders.push({ key, reason: 'zh empty/missing' });
      }
      if (typeof entry.en !== 'string' || entry.en.trim() === '') {
        offenders.push({ key, reason: 'en empty/missing' });
      }
    }
    if (offenders.length) {
      // Surface the exact offenders so a regression names the keys.
      throw new Error(
        `dict completeness failed: ${offenders.length} offender(s) — ` +
        offenders.slice(0, 20).map((o) => `${o.key} (${o.reason})`).join(', '),
      );
    }
    // Sanity: the dict should be a real, populated lookup (not stubbed out).
    expect(Object.keys(dict).length).toBeGreaterThan(50);
  });
});
