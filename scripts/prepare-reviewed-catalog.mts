/** Validate reviewed editorial rows through Wordbase's actual SQLite service.
 * This command ALWAYS uses memory; it cannot publish or edit production. */
process.env.WORDBASE_DB_PATH = ':memory:';
process.env.ASC_KEY_ID = '';
process.env.ASC_ISSUER_ID = '';
const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
const { initializeDatabase } = await import('../packages/api/src/db/index.js');
const { createApp, publishApp, getApp, listApps } = await import('../packages/api/src/services/app.service.js');
initializeDatabase();
const { fileURLToPath } = await import('node:url');
const { join } = await import('node:path');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.preview/catalog-review');
const inputs = JSON.parse(readFileSync(join(root, 'content/reviewed-apps.json'), 'utf8'));
const order: string[] = JSON.parse(readFileSync(join(root, 'content/reviewed-app-order.json'), 'utf8'));
for (const input of inputs) {
  input.sortOrder = order.indexOf(input.slug);
  const row = await createApp({ ...input, meta: JSON.stringify(input.meta) });
  await publishApp(row.id);
  const stored = await getApp(input.slug);
  if (stored?.platform !== input.platform || stored.status !== 'published') throw new Error('Catalog roundtrip failed');
  if (input.subtitle && stored.subtitle !== input.subtitle) throw new Error('Subtitle storage failed');
  if (stored.appStoreId || stored.appStoreUrl) throw new Error('Non-store app acquired a fabricated store listing');
}
const { data } = await listApps({ status: 'published', limit: 100 });
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'apps.json'), JSON.stringify(data, null, 2));
writeFileSync(join(output, 'verification.json'), JSON.stringify({ database: ':memory:', productionWrites: false,
  rows: data.map(app => ({ slug: app.slug, platform: app.platform, status: app.status, storeId: app.appStoreId })),
  flow: ['createApp', 'publishApp', 'getApp', 'listApps'], source: 'content/reviewed-apps.json' }, null, 2));
console.log('Reviewed Web/macOS catalog rows passed the actual SQLite service; production unchanged.');
