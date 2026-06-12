// Locale URL helpers — used by BaseLayout (hreflang) and the en/* Astro
// pages (link rewriting). The /en/ subtree mirrors the zh one (DP-001=A),
// so for a current zh path of /posts/foo the en twin is /en/posts/foo.
// For the apex / the en twin is /en (no trailing slash — the build serves
// /en/index.astro as /en). For an en path /en/posts/foo the zh twin is
// /posts/foo. These helpers are pure: a page frontmatter can call them
// without going through the DOM.

export const LOCALES = ['zh', 'en'] as const;
export type Locale = typeof LOCALES[number];

/** Build the en twin URL from a zh URL. `/` → `/en`; `/posts/foo` → `/en/posts/foo`. */
export function enHref(zhPath: string): string {
  if (zhPath === '/' || zhPath === '') return '/en';
  const normalized = zhPath.startsWith('/') ? zhPath : `/${zhPath}`;
  return `/en${normalized}`;
}

/** Strip the /en prefix from a path. `/en` → `/`; `/en/posts/foo` → `/posts/foo`. */
export function stripEn(path: string): string {
  if (path === '/en' || path === '/en/') return '/';
  if (path.startsWith('/en/')) return path.slice(3);
  return path;
}

/** True when the given path is under the /en subtree (or exactly /en). */
export function isEnPath(path: string): boolean {
  return path === '/en' || path === '/en/' || path.startsWith('/en/');
}

/**
 * Bidirectional hreflang set: always emit zh + en + x-default.
 * `currentPath` is the URL of the page being rendered (zh OR en); we
 * compute the OTHER side and return absolute URLs derived from `site`.
 * x-default points to the zh URL by project convention.
 */
export function hreflangAlternates(
  currentPath: string,
  site: URL | string | undefined
): { hreflang: 'zh-CN' | 'en' | 'x-default'; href: string }[] {
  const siteHref = typeof site === 'string' ? site.replace(/\/$/, '') : site?.href.replace(/\/$/, '') ?? '';
  const other = isEnPath(currentPath) ? stripEn(currentPath) : enHref(currentPath);
  const zhUrl = `${siteHref}${currentPath}`;
  const enUrl = isEnPath(currentPath) ? `${siteHref}${currentPath}` : `${siteHref}${other}`;
  return [
    { hreflang: 'zh-CN',   href: isEnPath(currentPath) ? `${siteHref}${other}` : zhUrl },
    { hreflang: 'en',      href: enUrl },
    { hreflang: 'x-default', href: isEnPath(currentPath) ? `${siteHref}${other}` : zhUrl },
  ];
}
