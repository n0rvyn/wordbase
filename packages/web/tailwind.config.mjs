import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  // Admin shares the front-end's [data-theme] system (tokens.css). dark: variants
  // activate whenever an ancestor carries data-theme="dark".
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Semantic colors backed by tokens.css CSS vars — flip automatically with
      // [data-theme]. The native Tailwind palette stays intact for status badges.
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        'ink-4': 'var(--ink-4)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        accent: 'var(--accent)',
        'on-accent': 'var(--on-accent)',
      },
      // Bare `border` / `divide-y` (no explicit color) resolve to the hairline
      // token, so dividers theme without per-element edits. Front-end uses pure
      // semantic CSS (no bare Tailwind borders), so this is admin-only in effect.
      borderColor: { DEFAULT: 'var(--line)' },
      divideColor: { DEFAULT: 'var(--line)' },
    },
  },
  plugins: [typography],
};
