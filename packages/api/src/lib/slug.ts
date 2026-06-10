import { pinyin } from 'pinyin-pro';

const MAX_LEN = 50;

/**
 * Convert CJK characters to toneless pinyin syllables while keeping
 * non-CJK runs (acronyms like "DBOS", digits, latin words) intact.
 * e.g. "内容DBOS1" -> "nei rong DBOS1"
 */
function toAscii(text: string): string {
  const parts = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  return parts.join(' ');
}

/** Lowercase, collapse non-alphanumerics to hyphens, trim hyphens. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Truncate to `max` chars without splitting a word; never leaves a trailing hyphen. */
function capAtBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, '');
}

export interface SlugOptions {
  /** Already-taken slugs to dedupe against (collision -> `-2`, `-3`, ...). */
  existing?: Set<string>;
  /** Used when the title yields an empty slug (typically the post id). */
  fallbackId?: string;
}

/**
 * Build an SEO-friendly ASCII slug from a title.
 * - CJK -> pinyin; ASCII passed through; digits kept.
 * - Output always matches /^[a-z0-9]+(-[a-z0-9]+)*$/, length <= 50.
 * - Empty result falls back to `fallbackId`, then to 'post' (never empty).
 * - Collisions against `existing` get an incrementing `-N` suffix.
 */
export function generateSlug(title: string, opts: SlugOptions = {}): string {
  let base = '';
  try {
    base = capAtBoundary(normalize(toAscii(title)), MAX_LEN);
  } catch {
    base = '';
  }
  if (!base) base = normalize(opts.fallbackId ?? '') || 'post';

  const existing = opts.existing;
  if (!existing || !existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
