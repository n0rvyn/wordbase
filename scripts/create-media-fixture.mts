/** Build two synthetic catalog records using the real MCP authoring and review
 * handlers against an in-memory database. Never reads or writes production. */
process.env.WORDBASE_DB_PATH = ':memory:';
process.env.ASC_KEY_ID = '';
process.env.ASC_ISSUER_ID = '';
const { initializeDatabase } = await import('../packages/api/src/db/index.js');
initializeDatabase();
const { registerTools, REGISTERED_DESCRIPTORS } = await import('../packages/api/src/mcp/tools.js');
const { buildInputSchema } = await import('../packages/api/src/mcp/schema.js');
const { prepareAppImport } = await import('../packages/api/src/services/app-import.service.js');
const { z } = await import('../packages/api/node_modules/zod/index.js');
const { writeFileSync, mkdirSync } = await import('node:fs');
const handlers = new Map<string, (args: Record<string, unknown>) => Promise<any>>();
registerTools({ tool(name: string, _description: string, _schema: unknown, handler: any) { handlers.set(name, handler); } } as never, ['apps:read', 'apps:write']);
async function invoke(name: string, args: Record<string, unknown>) {
  const parsed = z.object(buildInputSchema(REGISTERED_DESCRIPTORS.get(name)!)).parse(args);
  const response = await handlers.get(name)!(parsed);
  if (response.isError) throw new Error(response.content[0].text);
  return JSON.parse(response.content[0].text);
}
const catalog = [];
for (const spec of [
  { name: 'QA Landscape Video', slug: 'qa-landscape-video', platform: 'macOS', promotionalMedia: { type: 'video', src: '/__qa__/assets/landscape.mp4', poster: '/__qa__/assets/landscape-poster.jpg', alt: 'Local test pattern with an audio track; playback must be muted' } },
  { name: 'QA Portrait Animation', slug: 'qa-portrait-animation', platform: 'iOS', promotionalMedia: { type: 'animated-image', src: '/__qa__/assets/portrait.gif', poster: '/__qa__/assets/portrait-poster.png', alt: 'Local animated portrait test pattern' } },
]) {
  const created = await invoke('app_create', { name: spec.name, slug: spec.slug, platform: spec.platform });
  await invoke('app_update', { id: created.id, meta: JSON.stringify({ fixture: true, i18n: { en: { name: spec.name } } }) });
  const edited = await invoke('app_update', { id: created.id, promotionalMedia: spec.promotionalMedia });
  const proposal = prepareAppImport(edited, { version: '99.0' }, 'fixture')!;
  const read = await invoke('app_import_list', { proposalId: proposal.id });
  await invoke('app_import_review', { proposalId: read.id, reviewToken: read.reviewToken, action: 'apply', fields: ['version'] });
  const published = await invoke('app_update', { id: created.id, status: 'published' });
  if (JSON.stringify(JSON.parse(published.meta).promotionalMedia) !== JSON.stringify(spec.promotionalMedia)) throw new Error('Import changed editorial media');
  catalog.push(published);
}
mkdirSync('.preview/media-fixture', { recursive: true });
writeFileSync('.preview/media-fixture/catalog.json', JSON.stringify(catalog, null, 2));
writeFileSync('.preview/media-fixture/authoring-verification.json', JSON.stringify({ database: ':memory:', productionCalls: false, schemasValidated: true,
  flow: ['app_create', 'app_update metadata', 'app_update promotionalMedia', 'app_import_list', 'app_import_review selected version', 'app_update publication'],
  records: catalog.map(app => ({ name: app.name, slug: app.slug, version: app.version, promotionalMedia: JSON.parse(app.meta).promotionalMedia, preservedOtherMetadata: JSON.parse(app.meta).fixture === true })) }, null, 2));
console.log('Created 2 QA media records via validated MCP handlers; reviewed imports preserved their editorial media.');
