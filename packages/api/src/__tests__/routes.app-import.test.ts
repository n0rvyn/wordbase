import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { apiKeys, apps } from '../db/schema.js';
import { createApp, getApp, updateApp } from '../services/app.service.js';
import { prepareAppImport } from '../services/app-import.service.js';
import { registerTools } from '../mcp/tools.js';

vi.mock('../services/build.service.js', async (original) => ({ ...await original<typeof import('../services/build.service.js')>(), triggerBuild: vi.fn() }));
const { app } = await import('../app.js');
const { triggerBuild } = await import('../services/build.service.js');
const writeKey = 'wbimport-write-key';
const readKey = 'wbreader-only-key';
const headers = (key = writeKey) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
beforeAll(async () => {
  for (const [key, scopes] of [[writeKey, ['apps:write']], [readKey, ['apps:read']]] as const) {
    await db.insert(apiKeys).values({ id: key, name: key, keyPrefix: key.slice(0, 8), keyHash: await bcrypt.hash(key, 4), permissions: JSON.stringify(scopes), createdAt: 1 });
  }
});
beforeEach(async () => { await db.delete(apps); vi.mocked(triggerBuild).mockClear(); });
async function suggestion() {
  const catalog = await createApp({ name: 'Curated', slug: 'keep-this-url', appStoreId: '123', status: 'published', description: 'Curated copy', links: { privacy: 'https://norvyn.com/existing-privacy' } });
  return { catalog, proposal: prepareAppImport(catalog, { name: 'Apple name', version: '2.0' }, 'cn')! };
}

describe('reviewed import REST contract', () => {
  it('requires auth and write scope even for reading unreleased import proposals', async () => {
    const { proposal } = await suggestion();
    for (const path of ['/api/apps/imports', `/api/apps/imports/${proposal.id}`]) {
      expect((await app.request(path)).status).toBe(401);
      expect((await app.request(path, { headers: headers(readKey) })).status).toBe(403);
      expect((await app.request(path, { headers: headers() })).status).toBe(200);
    }
    expect((await app.request(`/api/apps/imports/${proposal.id}/review`, { method: 'POST', headers: headers(readKey), body: JSON.stringify({ reviewToken: proposal.reviewToken, fields: ['name'], action: 'apply' }) })).status).toBe(403);
  });

  it('applies selected changes and rebuilds only after an authenticated review', async () => {
    const { catalog, proposal } = await suggestion();
    const read = await app.request(`/api/apps/imports/${proposal.id}`, { headers: headers() });
    expect((await read.json() as any).changes.version.after).toBe('2.0');
    expect(triggerBuild).not.toHaveBeenCalled();
    const res = await app.request(`/api/apps/imports/${proposal.id}/review`, { method: 'POST', headers: headers(), body: JSON.stringify({ reviewToken: proposal.reviewToken, fields: ['version'], action: 'apply', name: 'arbitrary injected name' }) });
    expect(res.status).toBe(200);
    const current = (await getApp(catalog.id))!;
    expect(current.version).toBe('2.0');
    expect(current.name).toBe('Curated');
    expect(current.slug).toBe('keep-this-url');
    expect(triggerBuild).toHaveBeenCalledTimes(1);
  });

  it('returns standard 400/409 errors and never rebuilds invalid or stale reviews', async () => {
    const { catalog, proposal } = await suggestion();
    const body = { reviewToken: proposal.reviewToken, fields: ['slug'], action: 'apply' };
    const bad = await app.request(`/api/apps/imports/${proposal.id}/review`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    expect(bad.status).toBe(400);
    expect((await bad.json() as any).error.code).toBe('INVALID_REVIEW');
    await updateApp(catalog.id, { tagline: 'New editorial work' });
    const stale = await app.request(`/api/apps/imports/${proposal.id}/review`, { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, fields: ['name'] }) });
    expect(stale.status).toBe(409);
    expect((await stale.json() as any).error.code).toBe('STALE_IMPORT');
    expect(triggerBuild).not.toHaveBeenCalled();
  });
});

  const handlers = (scopes = ['apps:write']) => {
    const result = new Map<string, (args: Record<string, unknown>) => Promise<any>>();
    registerTools({ tool(name: string, _description: string, _schema: unknown, handler: any) { result.set(name, handler); } } as never, scopes);
    return result;
  };

describe('curated catalog MCP contract', () => {
  it('withholds review tools without write scope', () => {
    expect(handlers(['apps:read']).has('app_import_list')).toBe(false);
    expect(handlers(['apps:read']).has('app_import_review')).toBe(false);
  });
  it('reports a missing proposal as an MCP error instead of a successful null', async () => {
    const response = await handlers().get('app_import_list')!({ proposalId: 'missing' });
    expect(response.isError).toBe(true);
  });
  it('allows manual art/copy and applies reviewed imports using the same service', async () => {
    const { catalog } = await suggestion();
    const tools = handlers();
    await tools.get('app_update')!({ id: catalog.id, description: 'Manual copy', icon: '/uploads/curated.png', screenshots: ['/uploads/curated-shot.png'] });
    const current = (await getApp(catalog.id))!;
    expect(current.description).toBe('Manual copy');
    expect(current.icon).toBe('/uploads/curated.png');
    expect(current.screenshots).toBe('["/uploads/curated-shot.png"]');
    const proposal = prepareAppImport(current, { version: '3.0' }, 'cn')!;
    const read = await tools.get('app_import_list')!({ proposalId: proposal.id });
    expect(JSON.parse(read.content[0].text).changes.version.after).toBe('3.0');
    const applied = await tools.get('app_import_review')!({ proposalId: proposal.id, reviewToken: proposal.reviewToken, action: 'apply', fields: ['version'] });
    expect(applied.isError).not.toBe(true);
    expect((await getApp(catalog.id))!.version).toBe('3.0');
    expect(triggerBuild).toHaveBeenCalledTimes(1);
  });

  it('authors promotional media through MCP and preserves it through a reviewed Apple import', async () => {
    const { catalog } = await suggestion();
    await updateApp(catalog.id, { meta: JSON.stringify({ i18n: { en: { name: 'English copy' } }, editorial: 'keep' }) });
    const tools = handlers();
    const media = { type: 'animated-image', src: '/uploads/promo.gif', poster: '/uploads/still.png', alt: 'A drawing comes to life' };
    await tools.get('app_update')!({ id: catalog.id, promotionalMedia: media });
    const edited = (await getApp(catalog.id))!;
    expect(JSON.parse(edited.meta!)).toMatchObject({ promotionalMedia: media, editorial: 'keep', i18n: { en: { name: 'English copy' } } });
    const proposal = prepareAppImport(edited, { version: '4.0' }, 'cn')!;
    const list = await tools.get('app_import_list')!({ proposalId: proposal.id });
    const reviewed = JSON.parse(list.content[0].text);
    await tools.get('app_import_review')!({ proposalId: reviewed.id, reviewToken: reviewed.reviewToken, action: 'apply', fields: ['version'] });
    const after = (await getApp(catalog.id))!;
    expect(after.version).toBe('4.0');
    expect(JSON.parse(after.meta!).promotionalMedia).toEqual(media);
    expect(after.slug).toBe(catalog.slug);
    expect(after.links).toBe(catalog.links);
    await tools.get('app_update')!({ id: catalog.id, promotionalMedia: { type: 'none' } });
    expect(JSON.parse((await getApp(catalog.id))!.meta!)).toEqual({ editorial: 'keep', i18n: { en: { name: 'English copy' } } });
  });
});

describe('promotional-media REST authoring', () => {
  it('persists ordered video/GIF galleries through REST and MCP without touching publication or copy', async () => {
    const { catalog } = await suggestion();
    const items = [
      { type: 'video', id: 'p_recording', src: '/uploads/recording.mp4', poster: '/uploads/recording.jpg', label: 'Overview', width: 720, height: 1280 },
      { type: 'animated-image', id: 'p_launch', src: '/uploads/launch.gif', poster: '/uploads/launch.jpg', label: 'v1.3' },
    ];
    const result = await app.request(`/api/apps/${catalog.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ promotionalMedia: { items } }) });
    expect(result.status).toBe(200);
    const stored = (await getApp(catalog.id))!;
    expect(JSON.parse(stored.meta!).promotionalMedia.items).toEqual(items);
    for (const key of ['name', 'slug', 'status', 'description', 'links', 'appStoreId', 'appStoreUrl'] as const) expect(stored[key]).toBe(catalog[key]);
    const invalid = await app.request(`/api/apps/${catalog.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ promotionalMedia: { items: [items[0], { ...items[1], poster: undefined }] } }) });
    expect(invalid.status).toBe(400);
    expect((await getApp(catalog.id))!.meta).toBe(stored.meta);
    const response = await handlers().get('app_update')!({ id: catalog.id, promotionalMedia: { items: [...items].reverse() } });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse((await getApp(catalog.id))!.meta!).promotionalMedia.items).toEqual([...items].reverse());
  });

  it('validates media and requires write authorization without changing existing content', async () => {
    const { catalog } = await suggestion();
    const path = `/api/apps/${catalog.id}`;
    const body = JSON.stringify({ promotionalMedia: { type: 'video', src: '/uploads/promo.mp4', poster: '/uploads/still.png' } });
    expect((await app.request(path, { method: 'PUT', headers: headers(readKey), body })).status).toBe(403);
    const bad = await app.request(path, { method: 'PUT', headers: headers(), body: JSON.stringify({ promotionalMedia: { type: 'animated-image', src: '/uploads/promo.gif' } }) });
    expect(bad.status).toBe(400);
    expect((await getApp(catalog.id))!.meta).toBe(catalog.meta);
    expect((await app.request(path, { method: 'PUT', headers: headers(), body })).status).toBe(200);
    expect(JSON.parse((await getApp(catalog.id))!.meta!).promotionalMedia.type).toBe('video');
  });
});
