import type { App } from './api';

/**
 * Lighten/darken a hex colour by pct (-100..100).
 * Ported verbatim from App Detail.html:423-424; non-hex input returned unchanged.
 */
export function shade(hex: string, pct: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const ch = (c: number) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return '#' + [ch(r), ch(g), ch(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Safe JSON.parse for features / screenshots / links JSON strings.
 * Returns [] on null / malformed / non-array.
 */
export function parseJsonArray<T>(s: string | null): T[] {
  if (s == null) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const SITE_ACCENT = '#3457B6';

/**
 * Compute the two per-app CSS colour vars.
 * app  = accentColor ?? siteAccent
 * app2 = shade(app, -28)
 */
export function appColors(
  accentColor: string | null,
  siteAccent = SITE_ACCENT,
): { app: string; app2: string } {
  const app = accentColor ?? siteAccent;
  const app2 = shade(app, -28);
  return { app, app2 };
}

export interface MetaCell {
  k: string;
  v: string;
  star?: boolean;
}

/**
 * Build the meta row cells in display order, omitting any whose source is null/falsy.
 * Rating cell is omitted when ratingCount is 0 or null (DP-4.4).
 */
export function buildMetaCells(app: Pick<
  App,
  'version' | 'rating' | 'ratingCount' | 'price' | 'minimumOsVersion' | 'category'
>): MetaCell[] {
  const cells: MetaCell[] = [];

  if (app.version) {
    cells.push({ k: '版本', v: `v${app.version}` });
  }

  if (app.ratingCount) {
    cells.push({
      k: '评分',
      v: `${app.rating ?? ''} (${app.ratingCount})`,
      star: true,
    });
  }

  if (app.price) {
    cells.push({ k: '价格', v: app.price });
  }

  if (app.minimumOsVersion) {
    cells.push({ k: '系统要求', v: app.minimumOsVersion });
  }

  if (app.category) {
    cells.push({ k: '分类', v: app.category.split(' · ').pop()! });
  }

  return cells;
}

/**
 * Split a plain-text description blob into paragraphs (split on blank lines).
 * Trims each paragraph; drops empties. Returns [] for null.
 */
export function descriptionParagraphs(desc: string | null): string[] {
  if (desc == null) return [];
  return desc
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Convert a Unix timestamp (seconds) to its UTC year.
 * Returns null when ts is null.
 */
export function formatYear(ts: number | null): number | null {
  if (ts == null) return null;
  return new Date(ts * 1000).getUTCFullYear();
}
