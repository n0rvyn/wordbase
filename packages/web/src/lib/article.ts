export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/**
 * Inject index-based IDs into h2/h3 headings in an HTML string and extract
 * a TOC. h4+ headings are left untouched. CJK headings get stable anchors
 * via index-based IDs (h-0, h-1, …) rather than slug-based ones.
 */
export function injectHeadingIds(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  let i = 0;
  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const id = `h-${i++}`;
    toc.push({ id, level: Number(lvl), text: inner.replace(/<[^>]+>/g, '').trim() });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

/**
 * Given an array of slugs sorted newest→oldest, return the slug immediately
 * before (newer) and after (older) the current slug.
 * Returns { newer: null, older: null } if current is not found.
 */
export function selectAdjacent(
  orderedDescSlugs: string[],
  current: string,
): { newer: string | null; older: string | null } {
  const idx = orderedDescSlugs.indexOf(current);
  if (idx === -1) return { newer: null, older: null };
  return {
    newer: idx > 0 ? orderedDescSlugs[idx - 1] : null,
    older: idx < orderedDescSlugs.length - 1 ? orderedDescSlugs[idx + 1] : null,
  };
}
