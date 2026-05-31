import { describe, it, expect } from 'vitest';
import {
  readPrefs,
  mergePrefs,
  nextTheme,
  resolveTheme,
  resolveAccent,
  DEFAULT_THEME,
  DEFAULT_ACCENT,
} from './theme';

describe('readPrefs', () => {
  it('parses a valid stored blob', () => {
    expect(readPrefs('{"theme":"dark","accent":"#7088FF"}')).toEqual({
      theme: 'dark',
      accent: '#7088FF',
    });
  });
  it('returns {} for null (nothing stored yet)', () => {
    expect(readPrefs(null)).toEqual({});
  });
  it('returns {} for malformed JSON instead of throwing', () => {
    expect(readPrefs('{not json')).toEqual({});
  });
  it('returns {} for non-object JSON (number)', () => {
    expect(readPrefs('42')).toEqual({});
  });
  it('returns {} for array JSON', () => {
    expect(readPrefs('[1,2,3]')).toEqual({});
  });
});

describe('nextTheme', () => {
  it('flips light to dark', () => expect(nextTheme('light')).toBe('dark'));
  it('flips dark to light', () => expect(nextTheme('dark')).toBe('light'));
  it('treats an unknown/empty current as dark', () => expect(nextTheme('')).toBe('dark'));
});

describe('resolve* defaults', () => {
  it('resolveTheme falls back to default when absent', () =>
    expect(resolveTheme({})).toBe(DEFAULT_THEME));
  it('resolveAccent falls back to default when absent', () =>
    expect(resolveAccent({})).toBe(DEFAULT_ACCENT));
  it('resolveTheme uses the stored value', () =>
    expect(resolveTheme({ theme: 'dark' })).toBe('dark'));
  it('resolveAccent uses the stored value', () =>
    expect(resolveAccent({ accent: '#abcdef' })).toBe('#abcdef'));
});

describe('mergePrefs', () => {
  it('preserves accent when only the theme changes', () => {
    expect(mergePrefs({ theme: 'light', accent: '#abcdef' }, { theme: 'dark' })).toEqual({
      theme: 'dark',
      accent: '#abcdef',
    });
  });
});

describe('cross-reload persistence round-trip', () => {
  it('a toggled theme survives a simulated page reload', () => {
    // In-memory stand-in for localStorage.
    let store: string | null = null;
    const getItem = () => store;
    const setItem = (v: string) => {
      store = v;
    };

    // First load: nothing stored -> bootstrap resolves the default.
    let prefs = readPrefs(getItem());
    expect(resolveTheme(prefs)).toBe('light');

    // User clicks the toggle (mirrors BaseLayout's toggle handler).
    const current = resolveTheme(prefs); // 'light'
    const theme = nextTheme(current); // 'dark'
    const accent = resolveAccent(prefs); // default accent
    setItem(JSON.stringify(mergePrefs(prefs, { theme, accent })));

    // Reload: bootstrap re-reads localStorage.
    prefs = readPrefs(getItem());
    expect(resolveTheme(prefs)).toBe('dark');
    expect(resolveAccent(prefs)).toBe(DEFAULT_ACCENT);

    // Toggle again -> back to light, accent still preserved.
    const theme2 = nextTheme(resolveTheme(prefs)); // 'light'
    setItem(JSON.stringify(mergePrefs(prefs, { theme: theme2, accent: resolveAccent(prefs) })));
    prefs = readPrefs(getItem());
    expect(resolveTheme(prefs)).toBe('light');
    expect(resolveAccent(prefs)).toBe(DEFAULT_ACCENT);
  });

  it('a custom accent persists alongside theme toggles', () => {
    let store: string | null = JSON.stringify({ theme: 'dark', accent: '#7088FF' });
    const getItem = () => store;
    const setItem = (v: string) => {
      store = v;
    };

    let prefs = readPrefs(getItem());
    expect(resolveAccent(prefs)).toBe('#7088FF');

    // Toggle theme; accent must stay #7088FF.
    const theme = nextTheme(resolveTheme(prefs)); // 'light'
    setItem(JSON.stringify(mergePrefs(prefs, { theme, accent: resolveAccent(prefs) })));
    prefs = readPrefs(getItem());
    expect(resolveTheme(prefs)).toBe('light');
    expect(resolveAccent(prefs)).toBe('#7088FF');
  });
});
