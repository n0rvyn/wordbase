/** One article resolver for rankings and individual metrics. Read-only aliases;
 * exact route matching prevents slug-prefix and taxonomy collisions. */
export function analyticsPath(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  let path = raw.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* preserve literal percent in a slug */
  }
  return path.replace(/\/+$/, '').replace(/\.html$/i, '') || '/';
}
export function articleSlug(path: string): string | null {
  const match = path.match(/^\/(?:en\/)?posts\/([^/]+)$/);
  return match?.[1] ?? null;
}
export function articleResolver<T extends { id: string; slug: string }>(
  posts: T[],
  redirects: { fromPath: string; toPath: string }[] = [],
  protectedPaths: string[] = [],
) {
  const protectedSet = new Set(protectedPaths.map(analyticsPath));
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const aliases = new Map(
    redirects.map((r) => [analyticsPath(r.fromPath), analyticsPath(r.toPath)]),
  );
  return (raw: string) => {
    const original = analyticsPath(raw);
    if (!original) return null;
    let path: string | null = original;
    const seen = new Set<string>();
    for (let depth = 0; path && depth < 8; depth++) {
      if (seen.has(path)) return null;
      seen.add(path);
      const slug = articleSlug(path);
      const post = slug ? bySlug.get(slug) : undefined;
      if (post)
        return {
          post,
          locale: original.startsWith('/en/')
            ? ('en' as const)
            : ('default' as const),
          alias: path !== original,
        };
      if (
        path === '/' ||
        protectedSet.has(path) ||
        /^\/(?:en\/)?(?:tags|categories|apps|about|writing|archives|page|podcast|search|admin|api)(?:\/|$)/.test(
          path,
        )
      )
        return null;
      path = aliases.get(path) ?? null;
    }
    return null;
  };
}
