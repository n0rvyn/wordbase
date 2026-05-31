// Single source of truth for theme/accent persistence semantics.
//
// Two consumers apply these to the DOM:
//   1. BaseLayout's bottom toggle <script> imports these functions directly.
//   2. BaseLayout's <head> FOUC-prevention bootstrap is `is:inline` and CANNOT
//      import a module (it must run synchronously before paint), so it
//      hand-mirrors readPrefs + resolveTheme/resolveAccent. Keep that inline
//      copy in sync with the functions here.
//
// Persisted under localStorage['norvyn-v2'] with keys `theme` and `accent` only.

export const THEME_LS_KEY = 'norvyn-v2';
export const DEFAULT_THEME: Theme = 'light';
export const DEFAULT_ACCENT = '#3457B6';

export type Theme = 'light' | 'dark';

export interface ThemePrefs {
  theme?: string;
  accent?: string;
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
export function resolveTheme(prefs: ThemePrefs): string {
  return prefs.theme || DEFAULT_THEME;
}

/** Resolve the active accent, falling back to the default. */
export function resolveAccent(prefs: ThemePrefs): string {
  return prefs.accent || DEFAULT_ACCENT;
}

export interface AccentOption {
  value: string;
  name: string;
}

/** All available accent colors. Indigo is first and is the default. */
export const ACCENTS: AccentOption[] = [
  { value: '#3457B6', name: 'Indigo' },
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
