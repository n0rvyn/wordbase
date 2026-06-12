// i18n service — per-block Markdown translation cache (Phase 1, see plan
// docs/06-plans/2026-06-11-phase1-i18n-cache-plan.md).
//
// The bilingual pipeline splits source Markdown into top-level blocks via
// marked.lexer() (same lexer web rendering uses, so split boundaries are
// guaranteed stable across api/web), hashes each block deterministically,
// and stores translated text in the i18n_cache table keyed by (hash, lang).
// Human-edited rows are sticky: AI writes cannot overwrite them.
//
// All persistence goes through this service. REST routes and MCP tools will
// only call into here (added in later phases).

import { createHash } from 'node:crypto';
import { marked, type Token } from 'marked';
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { i18nCache, type I18nCache } from '../db/schema.js';

export interface Block {
  hash: string;
  raw: string;
}

/**
 * Normalize a Markdown block before hashing.
 *
 *  - strip trailing whitespace from every line (handles CRLF/LF differences
 *    and accidental trailing spaces from editors)
 *  - strip leading and trailing blank lines
 *
 * Frontmatter, code fences, and tables are not specially treated: `marked`
 * already preserves their `.raw` byte-for-byte, and source content fields
 * in posts/pages never carry frontmatter.
 */
export function normalizeBlock(raw: string): string {
  return raw
    .replace(/[ \t\r]+$/gm, '')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Deterministic 16-hex-char block hash. SHA-256 of the normalized raw,
 * truncated. 16 hex = 64 bits = collision risk well under per-post block
 * counts (typical post has <100 blocks).
 */
export function hashBlock(raw: string): string {
  return createHash('sha256').update(normalizeBlock(raw)).digest('hex').slice(0, 16);
}

/**
 * Split a Markdown document into top-level blocks. Each block carries its
 * hash (computed from normalized `.raw`) and the original raw text.
 *
 * Pure-whitespace 'space' tokens (marked emits these for runs of blank
 * lines between blocks) are dropped — they would otherwise create phantom
 * cache entries with no semantic content.
 */
export function splitBlocks(markdown: string): Block[] {
  const tokens = marked.lexer(markdown);
  const blocks: Block[] = [];
  for (const token of tokens) {
    if (token.type === 'space') continue;
    const raw = (token as Token & { raw: string }).raw;
    blocks.push({ hash: hashBlock(raw), raw });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Cache CRUD + render (Task 3)
// ---------------------------------------------------------------------------

/**
 * Read a single cache row by (sourceHash, lang). Returns null if missing.
 */
export async function getCache(sourceHash: string, lang: string): Promise<I18nCache | null> {
  const [row] = await db
    .select()
    .from(i18nCache)
    .where(and(eq(i18nCache.sourceHash, sourceHash), eq(i18nCache.lang, lang)))
    .limit(1);
  return row || null;
}

export interface PutCacheInput {
  sourceHash: string;
  lang: string;
  text: string;
  model: string;
  humanEdited: boolean;
}

export interface PutCacheResult {
  written: boolean;
  keptHuman: boolean;
  warning?: string;
}

/**
 * Insert-or-update one cache row. Select-then-branch (NOT
 * onConflictDoUpdate) to match the codebase convention; see
 * episode.service.ts:202-220 and grep confirms no service uses
 * onConflictDoUpdate.
 *
 * Human-edit guard (DP-001, plan): when an existing row has
 * humanEdited=1, a non-human write (humanEdited !== true on input) is
 * rejected — the existing human translation is kept and a warning is
 * returned. The guard is keyed on the incoming `humanEdited` flag, not
 * on `model`, so a model='claude-…' + humanEdited=true "human finalizes
 * AI draft" write can still replace a stale human edit.
 */
export async function putCache(input: PutCacheInput): Promise<PutCacheResult> {
  const { sourceHash, lang, text, model, humanEdited } = input;
  const now = Math.floor(Date.now() / 1000);

  const existing = await getCache(sourceHash, lang);
  if (existing) {
    if (existing.humanEdited === 1 && humanEdited !== true) {
      return {
        written: false,
        keptHuman: true,
        warning: `human_edited row preserved for ${sourceHash}/${lang} (incoming model='${model}')`,
      };
    }
    await db
      .update(i18nCache)
      .set({ text, model, humanEdited: humanEdited ? 1 : 0, updatedAt: now })
      .where(and(eq(i18nCache.sourceHash, sourceHash), eq(i18nCache.lang, lang)));
    return { written: true, keptHuman: false };
  }

  await db.insert(i18nCache).values({
    sourceHash,
    lang,
    text,
    model,
    humanEdited: humanEdited ? 1 : 0,
    updatedAt: now,
  });
  return { written: true, keptHuman: false };
}

export interface PutCacheBatchResult {
  written: number;
  keptHuman: number;
  warnings: string[];
}

/**
 * Batch putCache. Each entry is processed independently; aggregate counts
 * and warnings are returned. Errors from individual puts propagate (we do
 * not swallow mid-batch failures).
 */
export async function putCacheBatch(entries: PutCacheInput[]): Promise<PutCacheBatchResult> {
  let written = 0;
  let keptHuman = 0;
  const warnings: string[] = [];
  for (const entry of entries) {
    const r = await putCache(entry);
    if (r.written) written += 1;
    if (r.keptHuman) {
      keptHuman += 1;
      if (r.warning) warnings.push(r.warning);
    }
  }
  return { written, keptHuman, warnings };
}

export interface RenderLocalizedResult {
  markdown: string;
  coverage: { hit: number; total: number };
}

/**
 * Render a Markdown source into `lang` using the per-block cache. Blocks
 * without a cache hit fall back to the source `raw` (Chinese for zh-source
 * content). Coverage reports hit/total block counts.
 *
 * If `lang` is falsy or equal to the source language ('zh'), the source is
 * returned untouched with coverage 0/total (nothing translated, nothing
 * missing).
 */
export async function renderLocalized(
  sourceMarkdown: string,
  lang: string,
  sourceLang: string = 'zh'
): Promise<RenderLocalizedResult> {
  const blocks = splitBlocks(sourceMarkdown);
  const total = blocks.length;
  if (!lang || lang === sourceLang) {
    return { markdown: sourceMarkdown, coverage: { hit: 0, total } };
  }

  const parts: string[] = [];
  let hit = 0;
  for (const block of blocks) {
    const row = await getCache(block.hash, lang);
    // Block `.raw` from marked.lexer() may include the trailing blank lines
    // that separate it from the next block (e.g. a heading token's raw is
    // "# Title\n\n"). Strip those before re-joining with a single '\n\n'
    // so we don't double up separators.
    const body = row ? row.text : block.raw;
    parts.push(body.replace(/\n+$/g, ''));
    if (row) hit += 1;
  }
  return { markdown: parts.join('\n\n'), coverage: { hit, total } };
}

/**
 * Blocks in the source that have no cache entry for `lang`. Used by the
 * future translation dispatcher to know what still needs work.
 */
export async function findMissingBlocks(sourceMarkdown: string, lang: string): Promise<Block[]> {
  const blocks = splitBlocks(sourceMarkdown);
  const missing: Block[] = [];
  for (const block of blocks) {
    const row = await getCache(block.hash, lang);
    if (!row) missing.push(block);
  }
  return missing;
}

/**
 * Return human-edited rows for `lang` whose source hash is no longer in
 * the current document. These are "orphaned" human translations: the
 * source block changed and the hand-edited translation no longer maps to
 * anything. We return them so the caller can log/surface the warning;
 * rows are never deleted.
 *
 * Edge case: an empty `currentHashes` means the current source has no
 * blocks at all (e.g. post was emptied). SQLite's `NOT IN ()` behavior
 * for an empty list is ambiguous across versions, so we branch explicitly
 * and return every human-edited row in that case.
 */
export async function findOrphanedHumanEdits(
  currentHashes: string[],
  lang: string
): Promise<I18nCache[]> {
  if (currentHashes.length === 0) {
    return db
      .select()
      .from(i18nCache)
      .where(and(eq(i18nCache.lang, lang), eq(i18nCache.humanEdited, 1)));
  }
  return db
    .select()
    .from(i18nCache)
    .where(
      and(
        eq(i18nCache.lang, lang),
        eq(i18nCache.humanEdited, 1),
        notInArray(i18nCache.sourceHash, currentHashes)
      )
    );
}
