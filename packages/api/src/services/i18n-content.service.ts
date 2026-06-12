// i18n content service — entity orchestration for the bilingual pipeline
// (Phase 2, see plan docs/06-plans/2026-06-11-phase2-i18n-adapters-plan.md).
//
// This service sits ABOVE the pure i18n.service.ts primitives
// (hashBlock / splitBlocks / getCache / putCacheBatch / renderLocalized) and
// is the ONE place that knows how to resolve a (type, id, field) reference
// into source text and decide which fields are translatable. REST routes
// and MCP tools must call into this service — never into the content
// services directly — so the source-unit policy lives in exactly one place.
//
// Source-unit policy (locked at Phase 2, see plan "Architecture decisions"):
//   - post.content / page.content: Markdown → splitBlocks (multi-block).
//   - app.tagline: whole string is ONE source unit (hashBlock(text)).
//   - app.features: each {title, blurb} text is ONE source unit (not split).
//   - app.description / screenshots / icon: ASC-owned, NOT i18n. We refuse
//     to render or expose them here even if asked.
//
// Invariant: i18n.service.ts MUST NOT import from this file or from any
// content service — the pure primitives layer is dependency-free.

import { getPost, listPosts } from './post.service.js';
import { getPage, listPages } from './page.service.js';
import { getApp, listApps } from './app.service.js';
import {
  hashBlock,
  getCache,
  putCacheBatch,
  renderLocalized,
  splitBlocks,
  type PutCacheInput,
  type PutCacheBatchResult,
  type RenderLocalizedResult,
} from './i18n.service.js';

export type EntityType = 'post' | 'page' | 'app';

// A translatable field name. Validated in renderEntityField; anything else
// (including ASC-owned app.description/screenshots/icon) is rejected.
// 'title' is a single whole-string unit for post/page (mirrors the app.tagline
// treatment — never splitBlocks, so the render key matches the
// collectTranslatableUnits enumeration key `hashBlock(title)` and titles with
// markdown characters still hit the cache).
export type EntityField = 'content' | 'title' | 'tagline' | 'features';

export interface RenderEntityFieldResult {
  value: string;
  coverage: { hit: number; total: number };
}

// ---------------------------------------------------------------------------
// Entity loaders — accept BOTH id and slug because getPost / getPage / getApp
// both fall back to slug lookup. Draft entities return null here so the route
// can map that to 404 (the render endpoint is public but published-only).
// ---------------------------------------------------------------------------

interface PostRow { id: string; status: string; title: string; content: string }
interface PageRow { id: string; status: string; title: string; content: string }
interface AppRow {
  id: string;
  status: string;
  tagline: string | null;
  // JSON-encoded array of {icon, title, blurb} per app.service.ts:116 — may be
  // null when features was never set.
  features: string | null;
}

async function loadEntity(
  type: EntityType,
  idOrSlug: string
): Promise<PostRow | PageRow | AppRow | null> {
  if (type === 'post') {
    const e = await getPost(idOrSlug);
    if (!e) return null;
    return { id: e.id, status: e.status, title: e.title, content: e.content };
  }
  if (type === 'page') {
    const e = await getPage(idOrSlug);
    if (!e) return null;
    return { id: e.id, status: e.status, title: e.title, content: e.content };
  }
  const e = await getApp(idOrSlug);
  if (!e) return null;
  return { id: e.id, status: e.status, tagline: e.tagline, features: e.features };
}

// ---------------------------------------------------------------------------
// renderEntityField — the only entry point REST and MCP use to get a
// translated value for a (type, id, field) reference. Returns null when:
//   - the entity does not exist
//   - the entity is not published (draft leaks blocked at the route layer)
//   - the (type, field) pair is not in the i18n whitelist
// ---------------------------------------------------------------------------

export async function renderEntityField(
  type: EntityType,
  id: string,
  field: EntityField,
  lang: string
): Promise<RenderEntityFieldResult | null> {
  const entity = await loadEntity(type, id);
  if (!entity || entity.status !== 'published') return null;

  if (type === 'post' || type === 'page') {
    if (field === 'content') {
      const md = (entity as PostRow | PageRow).content;
      const r: RenderLocalizedResult = await renderLocalized(md, lang);
      return { value: r.markdown, coverage: r.coverage };
    }
    if (field === 'title') {
      // Single whole-string unit (mirrors the app.tagline treatment).
      // NOT splitBlocks — the cache key is hashBlock(title) so the collect
      // step and the render step use the same hash. A title with markdown
      // characters (e.g. `code`, *italic*, [link]) still hits the cache.
      const text = (entity as PostRow | PageRow).title ?? '';
      if (!text) return { value: '', coverage: { hit: 0, total: 0 } };
      const hash = hashBlock(text);
      if (!lang || lang === 'zh') {
        return { value: text, coverage: { hit: 0, total: 1 } };
      }
      const row = await getCache(hash, lang);
      return {
        value: row ? row.text : text,
        coverage: { hit: row ? 1 : 0, total: 1 },
      };
    }
    return null;
  }

  // type === 'app'
  const app = entity as AppRow;
  if (field === 'tagline') {
    const text = app.tagline ?? '';
    if (!text) return { value: '', coverage: { hit: 0, total: 0 } };
    const hash = hashBlock(text);
    if (!lang || lang === 'zh') {
      return { value: text, coverage: { hit: 0, total: 1 } };
    }
    const row = await getCache(hash, lang);
    return {
      value: row ? row.text : text,
      coverage: { hit: row ? 1 : 0, total: 1 },
    };
  }
  if (field === 'features') {
    // app.service.ts:116 writes `null` for features when the input was
    // undefined. We additionally defend against bad JSON / non-array shapes
    // — those should never occur in production (app.service.ts:toJsonString
    // would have thrown) but a corrupted row must not 500 the render path.
    const parsed: unknown = app.features ? JSON.parse(app.features) : [];
    if (!Array.isArray(parsed)) return { value: '[]', coverage: { hit: 0, total: 0 } };

    if (parsed.length === 0) return { value: '[]', coverage: { hit: 0, total: 0 } };

    const localized: unknown[] = [];
    let hit = 0;
    let total = 0;
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        localized.push(item);
        continue;
      }
      const out: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      for (const k of ['title', 'blurb'] as const) {
        const v = (item as Record<string, unknown>)[k];
        if (typeof v !== 'string' || v.length === 0) continue;
        total += 1;
        const hash = hashBlock(v);
        if (!lang || lang === 'zh') {
          out[k] = v;
          continue;
        }
        const row = await getCache(hash, lang);
        if (row) {
          out[k] = row.text;
          hit += 1;
        } else {
          out[k] = v;
        }
      }
      localized.push(out);
    }
    return { value: JSON.stringify(localized), coverage: { hit, total } };
  }

  // app + other field = not in whitelist (description/screenshots/icon are
  // ASC-owned). Explicitly null so the route returns 404.
  return null;
}

// ---------------------------------------------------------------------------
// collectTranslatableUnits — enumerate every published unit so a translator
// (future wb-translate worker) can diff against the cache. ref strings are
// stable per (type, id, field) so they can be carried into a job queue.
// ---------------------------------------------------------------------------

export interface TranslatableUnit {
  hash: string;
  text: string;
  ref: string;
}

export async function collectTranslatableUnits(): Promise<TranslatableUnit[]> {
  const units: TranslatableUnit[] = [];
  const seen = new Set<string>();

  const push = (hash: string, text: string, ref: string) => {
    if (seen.has(hash)) return;
    seen.add(hash);
    units.push({ hash, text, ref });
  };

  // posts — paginate to completion (NO cap; every published post must reach the
  // translation pipeline, mirroring listPages' full enumeration below).
  const POST_PAGE = 500;
  for (let page = 1; ; page++) {
    const res = await listPosts({ status: 'published', limit: POST_PAGE, page });
    for (const post of res.data) {
      // Title is a single whole-string unit (mirrors the app.tagline
      // treatment). The render path uses the same hashBlock(title) key, so
      // translation primes and renders line up — no splitBlocks here.
      if (post.title) {
        push(hashBlock(post.title), post.title, `post:${post.id}:title`);
      }
      if (!post.content) continue;
      const ref = `post:${post.id}:content`;
      // Use splitBlocks for multi-block content; each block is its own unit.
      for (const b of splitBlocks(post.content)) {
        push(b.hash, b.raw, ref);
      }
    }
    if (res.data.length < POST_PAGE) break;
  }

  const pageList = await listPages();
  for (const page of pageList) {
    if (page.status !== 'published') continue;
    if (page.title) {
      push(hashBlock(page.title), page.title, `page:${page.id}:title`);
    }
    if (!page.content) continue;
    const ref = `page:${page.id}:content`;
    for (const b of splitBlocks(page.content)) {
      push(b.hash, b.raw, ref);
    }
  }

  // apps — paginate to completion (NO cap, same rationale as posts above).
  const APP_PAGE = 500;
  for (let page = 1; ; page++) {
    const res = await listApps({ status: 'published', limit: APP_PAGE, page });
    for (const app of res.data) {
      if (app.tagline) {
        push(hashBlock(app.tagline), app.tagline, `app:${app.id}:tagline`);
      }
      if (app.features) {
        const parsed: unknown = JSON.parse(app.features);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            for (const k of ['title', 'blurb'] as const) {
              const v = (item as Record<string, unknown>)[k];
              if (typeof v !== 'string' || v.length === 0) continue;
              push(hashBlock(v), v, `app:${app.id}:features.${k}`);
            }
          }
        }
      }
    }
    if (res.data.length < APP_PAGE) break;
  }

  return units;
}

// ---------------------------------------------------------------------------
// listPendingUnits — collectTranslatableUnits filtered down to those without
// a cache row for `lang`. The dispatcher calls this to know what still needs
// translation work.
// ---------------------------------------------------------------------------

export async function listPendingUnits(lang: string): Promise<TranslatableUnit[]> {
  const units = await collectTranslatableUnits();
  const out: TranslatableUnit[] = [];
  for (const u of units) {
    const row = await getCache(u.hash, lang);
    if (!row) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// putTranslations — thin pass-through to putCacheBatch. Preserves the
// human_edited guard semantics already implemented in i18n.service.ts.
// ---------------------------------------------------------------------------

export async function putTranslations(
  entries: PutCacheInput[]
): Promise<PutCacheBatchResult> {
  return putCacheBatch(entries);
}
