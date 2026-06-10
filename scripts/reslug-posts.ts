/**
 * Retroactive post re-slug migration (SEO-friendly ASCII slugs).
 *
 * For every post whose slug is not already clean ASCII:
 *   1. compute a new pinyin/ASCII slug (deduped against all slugs),
 *   2. write a 301 redirect  /posts/<old>  →  /posts/<new>,
 *   3. rewrite any existing redirect whose target was /posts/<old> to /posts/<new>
 *      (kills the chains left by the WordPress date-based redirects in migrate.ts).
 *
 * Idempotent: posts already ASCII are skipped; redirect inserts are conflict-ignored,
 * so a re-run after a crash is safe.
 *
 * Usage (run on the host whose SQLite DB holds the live posts):
 *   pnpm tsx scripts/reslug-posts.ts --dry-run
 *   pnpm tsx scripts/reslug-posts.ts
 */
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '../packages/api/src/db/index.js';
import { posts, redirects } from '../packages/api/src/db/schema.js';
import { generateSlug } from '../packages/api/src/lib/slug.js';

const ASCII_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRY_RUN = process.argv.includes('--dry-run');

interface Change {
  id: string;
  old: string;
  next: string;
}

async function main() {
  initializeDatabase();

  const allPosts = await db.select({ id: posts.id, slug: posts.slug, title: posts.title }).from(posts);

  // Reserve slugs that are already clean ASCII (they will not change), so renamed
  // posts dedupe around them. Compute every new slug up front against this growing
  // set — this (not a transaction) is what guarantees no two posts collide.
  const taken = new Set<string>();
  for (const p of allPosts) {
    if (ASCII_RE.test(p.slug)) taken.add(p.slug);
  }

  const changes: Change[] = [];
  for (const p of allPosts) {
    if (ASCII_RE.test(p.slug)) continue; // already clean — skip (idempotent)
    const next = generateSlug(p.title, { existing: taken, fallbackId: p.id });
    taken.add(next);
    changes.push({ id: p.id, old: p.slug, next });
  }

  console.log(`\n=== Re-slug plan (${changes.length} of ${allPosts.length} posts) ===`);
  for (const c of changes) {
    console.log(`  /posts/${c.old}\n      → /posts/${c.next}`);
  }

  // Report chain-fixes: existing redirects pointing at an old /posts/<slug>.
  const allRedirects = await db.select().from(redirects);
  const oldTargets = new Set(changes.map(c => `/posts/${c.old}`));
  const chainFixes = allRedirects.filter(r => oldTargets.has(r.toPath));
  console.log(`\n=== Redirect chain-fixes (${chainFixes.length}) ===`);
  for (const r of chainFixes) {
    const ch = changes.find(c => `/posts/${c.old}` === r.toPath)!;
    console.log(`  ${r.fromPath}  →  ${r.toPath}   becomes   → /posts/${ch.next}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no writes.');
    return;
  }
  if (changes.length === 0) {
    console.log('\nNothing to migrate.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let reslugged = 0;
  let rows = 0;
  let chained = 0;
  for (const c of changes) {
    const oldPath = `/posts/${c.old}`;
    const newPath = `/posts/${c.next}`;

    // 1. point the post at its new slug
    await db.update(posts).set({ slug: c.next }).where(eq(posts.id, c.id));
    reslugged++;

    // 2. 301 the old URL to the new one (conflict-ignored → idempotent)
    await db
      .insert(redirects)
      .values({ id: nanoid(), fromPath: oldPath, toPath: newPath, statusCode: 301, createdAt: now })
      .onConflictDoNothing({ target: redirects.fromPath });
    rows++;

    // 3. rewrite older redirects that targeted the old path (chain → single hop)
    const res = await db.update(redirects).set({ toPath: newPath }).where(eq(redirects.toPath, oldPath));
    chained += (res as { changes?: number }).changes ?? 0;
  }

  console.log(`\nDone: re-slugged ${reslugged} posts, wrote ${rows} redirect rows, chain-fixed ${chained} targets.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
