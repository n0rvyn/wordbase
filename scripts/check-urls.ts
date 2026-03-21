import { db } from '../packages/api/src/db/index.js';
import { redirects, posts } from '../packages/api/src/db/schema.js';
import { initializeDatabase } from '../packages/api/src/db/index.js';

async function main() {
  initializeDatabase();

  const reds = await db.select().from(redirects).limit(10);
  console.log('=== Redirect samples (old → new) ===');
  reds.forEach(r => console.log(`  ${r.fromPath}  →  ${r.toPath}  (${r.statusCode})`));

  const totalRedirects = await db.select().from(redirects);
  console.log(`\nTotal redirects: ${totalRedirects.length}`);

  console.log('\n=== New URL structure ===');
  const ps = await db.select().from(posts).limit(5);
  ps.forEach(p => console.log(`  /posts/${p.slug}`));

  console.log('\n=== Problem analysis ===');
  console.log('Old WordPress URL format: /YYYY/MM/slug/');
  console.log('New Wordbase URL format:  /posts/slug');
  console.log('');
  console.log('Redirects cover: old date-based URLs → new /posts/slug URLs');
  console.log('BUT: new URLs use /posts/ prefix which WordPress did not have.');
  console.log('');
  console.log('If you switch domain from norvyn.com → blog.norvyn.com:');
  console.log('  - Google indexed: norvyn.com/2024/01/slug/');
  console.log('  - New URL:        blog.norvyn.com/posts/slug');
  console.log('  - Need: norvyn.com/2024/01/slug/ → 301 → blog.norvyn.com/posts/slug');
  console.log('  - Then later: blog.norvyn.com → norvyn.com with same /posts/slug paths');
}

main().catch(console.error);
