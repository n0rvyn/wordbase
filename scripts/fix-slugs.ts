import { db } from '../packages/api/src/db/index.js';
import { posts, pages, redirects, tags, categories } from '../packages/api/src/db/schema.js';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../packages/api/src/db/index.js';

async function fixTable(table: any, name: string) {
  const all = await db.select().from(table);
  let fixed = 0;
  for (const row of all) {
    if ('slug' in row) {
      try {
        const decoded = decodeURIComponent(row.slug);
        if (decoded !== row.slug) {
          await db.update(table).set({ slug: decoded }).where(eq(table.id, row.id));
          fixed++;
        }
      } catch {}
    }
    if ('fromPath' in row) {
      try {
        const decodedFrom = decodeURIComponent(row.fromPath);
        const decodedTo = decodeURIComponent(row.toPath);
        if (decodedFrom !== row.fromPath || decodedTo !== row.toPath) {
          await db.update(table).set({ fromPath: decodedFrom, toPath: decodedTo }).where(eq(table.id, row.id));
          fixed++;
        }
      } catch {}
    }
  }
  console.log(`Fixed ${fixed} ${name} slugs`);
}

async function main() {
  initializeDatabase();
  await fixTable(posts, 'post');
  await fixTable(pages, 'page');
  await fixTable(tags, 'tag');
  await fixTable(categories, 'category');
  await fixTable(redirects, 'redirect');
}

main().catch(console.error);
