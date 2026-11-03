import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '../db/index.js';
import { apps, appImports } from '../db/schema.js';
import { createApp, getApp, updateApp } from '../services/app.service.js';
import { prepareAppImport, getAppImport, listAppImports, reviewAppImport } from '../services/app-import.service.js';
import { syncApp } from '../services/app-sync.service.js';

vi.mock('../services/appstore-lookup.service.js', () => ({
  lookupAppAnyStorefront: vi.fn(async () => ({ storefront: 'cn', meta: { name: 'Apple name', version: '2.0', icon: 'https://example.com/new.png', description: 'Apple description' } })),
  lookupEnCopy: vi.fn(async () => ({ name: 'English store name', description: 'Store copy', price: '$1', whatsNew: 'New' })),
}));
vi.mock('../services/asc.service.js', () => ({ isAscConfigured: vi.fn(() => false), fetchAppMetadata: vi.fn(), listAscApps: vi.fn() }));

beforeEach(async () => { await db.delete(apps); });
async function seed() {
  return createApp({ name: 'Curated name', slug: 'stable-app', appStoreId: '123', status: 'published', description: 'Curated description', links: { support: 'https://norvyn.com/stable-support', privacy: 'https://norvyn.com/stable-privacy' }, meta: JSON.stringify({ editorial: 'keep', i18n: { en: { name: 'Curated English' }, fr: { name: 'French' } } }) });
}

describe('curated Apple imports', () => {
  it('legacy sync stores a persistent diff without changing any display field or timestamp', async () => {
    const original = await seed();
    const change = await syncApp(original.id);
    expect(change.mode).toBe('review_required');
    expect(change.fields).toContain('name');
    expect(await getApp(original.id)).toEqual(original);
    initializeDatabase(); // additive initialization never clears suggestions or content
    const proposal = getAppImport(change.proposalId!);
    expect(proposal.changes.name).toEqual({ before: 'Curated name', after: 'Apple name' });
    expect(listAppImports(original.id)).toHaveLength(1);
    expect((await syncApp(original.id)).proposalId).toBe(change.proposalId);
    expect(listAppImports(original.id)).toHaveLength(1);
  });

  it('applies only explicitly selected stored fields and keeps identity, publication and legal links', async () => {
    const original = await seed();
    const change = await syncApp(original.id);
    const proposal = getAppImport(change.proposalId!);
    const result = reviewAppImport(proposal.id, proposal.reviewToken, ['version'], 'apply');
    const current = (await getApp(original.id))!;
    expect(result.applied).toEqual(['version']);
    expect(current.version).toBe('2.0');
    for (const field of ['name', 'description', 'icon', 'slug', 'status', 'links', 'appStoreId', 'meta'] as const) expect(current[field]).toEqual(original[field]);
    expect(() => reviewAppImport(proposal.id, proposal.reviewToken, ['name'], 'apply')).toThrow(/already been reviewed/);
  });

  it('rejects stale proposals even when an edit shares the original second-resolution timestamp', async () => {
    const original = await seed();
    const proposal = prepareAppImport(original, { name: 'Imported' }, 'cn')!;
    await db.update(apps).set({ description: 'Concurrent editorial edit', updatedAt: original.updatedAt }).where(eq(apps.id, original.id));
    expect(() => reviewAppImport(proposal.id, proposal.reviewToken, ['name'], 'apply')).toThrow(/Catalog changed/);
    expect((await getApp(original.id))!.name).toBe('Curated name');
    expect(getAppImport(proposal.id).status).toBe('pending');
  });

  it('requires a readback token, changed field selection and rejects protected fields', async () => {
    const original = await seed();
    const proposal = prepareAppImport(original, { name: 'Imported' }, 'cn')!;
    expect(() => reviewAppImport(proposal.id, 'wrong', ['name'], 'apply')).toThrow(/reviewToken/);
    for (const fields of [[], ['slug'], ['name', 'links'], ['icon']]) expect(() => reviewAppImport(proposal.id, proposal.reviewToken, fields, 'apply')).toThrow(/Select at least one/);
    expect(() => prepareAppImport(original, { status: 'draft' }, 'cn')).toThrow(/Unsupported/);
    expect(await getApp(original.id)).toEqual(original);
  });

  it('merges reviewed English copy without replacing unrelated editorial metadata or languages', async () => {
    const original = await seed();
    const proposal = prepareAppImport(original, { englishCopy: { name: 'Imported English', description: 'English', price: '$1', whatsNew: 'New' } }, 'cn')!;
    reviewAppImport(proposal.id, proposal.reviewToken, ['englishCopy'], 'apply');
    const meta = JSON.parse((await getApp(original.id))!.meta!);
    expect(meta.editorial).toBe('keep');
    expect(meta.i18n.fr).toEqual({ name: 'French' });
    expect(meta.i18n.en.name).toBe('Imported English');
  });

  it('rejects proposals without applying and expires old suggestions', async () => {
    const original = await seed();
    const proposal = prepareAppImport(original, { name: 'Imported' }, 'cn')!;
    await db.update(appImports).set({ createdAt: 1 }).where(eq(appImports.id, proposal.id));
    expect(() => reviewAppImport(proposal.id, proposal.reviewToken, ['name'], 'apply')).toThrow(/expired/);
    reviewAppImport(proposal.id, proposal.reviewToken, [], 'reject');
    expect(listAppImports(original.id)).toEqual([]);
    expect(await getApp(original.id)).toEqual(original);
  });

  it('refreshes expired identical proposals under a new ID without reviving an old review', async () => {
    const original = await seed();
    const old = prepareAppImport(original, { name: 'Imported' }, 'cn')!;
    await db.update(appImports).set({ createdAt: 1 }).where(eq(appImports.id, old.id));
    const fresh = prepareAppImport(original, { name: 'Imported' }, 'cn')!;
    expect(fresh.id).not.toBe(old.id);
    expect(() => reviewAppImport(old.id, old.reviewToken, ['name'], 'apply')).toThrow(/expired/);
    reviewAppImport(fresh.id, fresh.reviewToken, ['name'], 'apply');
    expect((await getApp(original.id))!.name).toBe('Imported');
  });

  it('allows manual copy, icon and screenshot edits without requiring Apple', async () => {
    const original = await seed();
    await updateApp(original.id, { description: 'Handwritten', icon: '/uploads/icon.png', screenshots: ['/uploads/shot.png'], version: '3.0' });
    const current = (await getApp(original.id))!;
    expect(current.description).toBe('Handwritten');
    expect(current.screenshots).toBe('["/uploads/shot.png"]');
    expect(current.version).toBe('3.0');
  });
});
