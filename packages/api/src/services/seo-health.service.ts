import { resolve } from 'node:path';
import { statSync, readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { posts } from '../db/schema.js';
import { REPO_ROOT } from '../paths.js';

// Static build output directory. Resolved once at module load — both
// `src/services/seo-health.service.ts` (vitest) and the compiled
// `dist/services/seo-health.service.js` sit one level under packages/api,
// so REPO_ROOT gives us packages/, then /web/dist lands us in dist.
const DIST = resolve(REPO_ROOT, 'packages/web/dist');

function exists(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

/**
 * Read-only SEO health snapshot. Surfaces:
 *  - which static artifacts (sitemap / robots / rss / llms.txt) are present
 *  - the canonical host baked into sitemap.xml (catches the P0 class of
 *    regressions where a hardcoded `blog.norvyn.com` slipped back in)
 *  - DB-side coverage proxies (excerpt / coverImage) for published posts
 *  - derived issues for the admin panel
 *
 * Safe to call in any environment: every filesystem touch is wrapped in
 * try/catch (mirrors observability.service.ts:78), so a missing dist/
 * returns exists:false with no throw.
 */
export function getSeoHealth() {
  const sitemapPath = resolve(DIST, 'sitemap.xml');
  let urlCount = 0;
  let canonicalHost: string | null = null;
  try {
    const xml = readFileSync(sitemapPath, 'utf8');
    urlCount = (xml.match(/<loc>/g) || []).length;
    canonicalHost = xml.match(/<loc>https?:\/\/([^/]+)/)?.[1] ?? null;
  } catch {
    // dist/ or sitemap.xml missing — leave urlCount/canonicalHost at defaults
  }

  // ENRICHMENT coverage, NOT presence. Every published page already emits a
  // <meta name="description"> (posts/[slug].astro falls back excerpt ->
  // meta.description -> stripMarkdown(content)) and an og:image (BaseLayout
  // defaults to /og-image.png), so effective crawler-facing coverage is ~100%.
  // What's actionable is how many posts carry a HAND-AUTHORED excerpt / CUSTOM
  // cover (stronger than the auto-derived fallback) — that's what we count here.
  // SQLite has no boolean count, so we sum a conditional.
  const rows = db.select({
    total: sql<number>`count(*)`,
    withExcerpt: sql<number>`sum(case when excerpt is not null and excerpt <> '' then 1 else 0 end)`,
    withCover: sql<number>`sum(case when cover_image is not null then 1 else 0 end)`,
  }).from(posts).where(sql`status = 'published'`).all() as Array<{ total: number; withExcerpt: number; withCover: number }>;
  const c = rows[0];

  const issues: string[] = [];
  if (canonicalHost && canonicalHost !== 'norvyn.com') {
    issues.push(`sitemap canonical host is ${canonicalHost}, expected norvyn.com`);
  }
  if (!exists(resolve(DIST, 'robots.txt'))) {
    issues.push('robots.txt missing in dist');
  }

  return {
    artifacts: {
      sitemap: { exists: exists(sitemapPath), urlCount, canonicalHost },
      robots: { exists: exists(resolve(DIST, 'robots.txt')) },
      blogFeed: { exists: exists(resolve(DIST, 'rss.xml')) },
      llmsTxt: { exists: exists(resolve(DIST, 'llms.txt')) },
    },
    coverage: {
      // Enrichment, not presence — see comment above. All pages still get an
      // auto-derived description + default OG image regardless of these counts.
      postsTotal: c?.total ?? 0,
      postsWithAuthoredExcerpt: c?.withExcerpt ?? 0,
      postsWithCustomCover: c?.withCover ?? 0,
    },
    issues,
  };
}
