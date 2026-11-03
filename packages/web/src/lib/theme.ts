// Single source of truth for theme/accent persistence semantics.
//
// Two consumers apply these to the DOM:
//   1. BaseLayout's bottom toggle <script> imports these functions directly.
//   2. BaseLayout's <head> FOUC-prevention bootstrap is `is:inline` and CANNOT
//      import a module (it must run synchronously before paint), so it
//      hand-mirrors readPrefs + resolveTheme/resolveAccent. Keep that inline
//      copy in sync with the functions here.
//
// Existing norvyn-v2 preferences remain compatible, including language and accent.

export const THEME_LS_KEY = 'norvyn-v2';
export const DEFAULT_THEME: Theme = 'light';
export const DEFAULT_ACCENT = '#ff5b2d';
export const DARK_DEFAULT_ACCENT = '#ff916d';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

/** Keep existing explicit choices; new visitors follow their operating system. */
export function themePreference(prefs: ThemePrefs): ThemePreference {
  return prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'system';
}

export interface ThemePrefs {
  theme?: string;
  accent?: string;
  /** Active UI language: 'zh' | 'en' (see lib/i18n.ts for detection). */
  lang?: string;
}

/** Parse the stored JSON blob; never throws, never returns a non-object. */
export function readPrefs(raw: string | null): ThemePrefs {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Merge a patch over current prefs; patch keys win. */
export function mergePrefs(current: ThemePrefs, patch: ThemePrefs): ThemePrefs {
  return { ...current, ...patch };
}

/** Flip light <-> dark. Anything that isn't 'dark' becomes 'dark'. */
export function nextTheme(current: string): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

/** Resolve the active theme, falling back to the default. */
export function resolveTheme(prefs: ThemePrefs, prefersDark = false): Theme {
  const preference = themePreference(prefs);
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

/** Resolve the active accent, falling back to the default. */
export function resolveAccent(prefs: ThemePrefs, theme: Theme = 'light'): string {
  return prefs.accent || (theme === 'dark' ? DARK_DEFAULT_ACCENT : DEFAULT_ACCENT);
}

export interface AccentOption {
  value: string;
  name: string;
}

/** Legacy accent choices remain valid for returning visitors. */
export const ACCENTS: AccentOption[] = [
  { value: DEFAULT_ACCENT, name: 'Terracotta' },
  { value: '#2C4EE0', name: 'Cobalt' },
  { value: '#0E7C66', name: 'Emerald' },
  { value: '#3F3F46', name: 'Graphite' },
  { value: '#B4612A', name: 'Ember' },
];

/** Returns true if `accent` is one of the known accent values. */
export function isValidAccent(accent: string): boolean {
  return ACCENTS.some(a => a.value === accent);
}

/**
 * Returns a new serialized localStorage blob with `accent` merged in.
 * Preserves any existing `theme` key. Pure — does NOT write to localStorage.
 */
export function persistAccent(raw: string | null, accent: string): string {
  return JSON.stringify(mergePrefs(readPrefs(raw), { accent }));
}
