import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import {
  createApp,
  getApp,
  listApps,
  updateApp,
  publishApp,
  deleteApp,
  discoverApps,
} from '../services/app.service.js';

// Mock asc.service for discoverApps tests
vi.mock('../services/asc.service.js', () => ({
  listAscApps: vi.fn(),
}));
import { listAscApps } from '../services/asc.service.js';
const listAscAppsMock = listAscApps as ReturnType<typeof vi.fn>;

beforeEach(resetNewTables);

describe('app service', () => {
  it('createApp with features array stores JSON and getApp parses back equal', async () => {
    const features = [{ icon: '🎯', title: 'Feature 1', blurb: 'Does something' }];
    const app = await createApp({
      name: 'My App',
      features,
    });
    expect(app.id).toBeTruthy();
    expect(app.slug).toBeTruthy();
    expect(app.status).toBe('draft');

    const found = await getApp(app.id);
    expect(found).toBeTruthy();
    const parsedFeatures = JSON.parse(found!.features as string);
    expect(parsedFeatures).toEqual(features);
  });

  it('createApp with invalid JSON string for features throws', async () => {
    await expect(
      createApp({ name: 'Bad App', features: 'not valid json' as unknown as object[] })
    ).rejects.toThrow();
  });

  it('publishApp sets status=published and numeric publishedAt', async () => {
    const app = await createApp({ name: 'Publish Me' });
    const published = await publishApp(app.id);
    expect(published?.status).toBe('published');
    expect(typeof published?.publishedAt).toBe('number');
  });

  it('listApps orders by sortOrder ascending', async () => {
    await createApp({ name: 'App B', sortOrder: 2 });
    await createApp({ name: 'App A', sortOrder: 1 });
    await createApp({ name: 'App C', sortOrder: 3 });

    const result = await listApps();
    expect(result.data[0].name).toBe('App A');
    expect(result.data[1].name).toBe('App B');
    expect(result.data[2].name).toBe('App C');
  });

  it('getApp finds by slug', async () => {
    const app = await createApp({ name: 'Slug Test App' });
    const found = await getApp(app.slug);
    expect(found?.id).toBe(app.id);
  });

  it('updateApp changes a field', async () => {
    const app = await createApp({ name: 'Original Name' });
    const updated = await updateApp(app.id, { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');
  });

  it('deleteApp removes the row', async () => {
    const app = await createApp({ name: 'Delete Me App' });
    await deleteApp(app.id);
    const found = await getApp(app.id);
    expect(found).toBeNull();
  });
});

describe('discoverApps', () => {
  beforeEach(() => {
    listAscAppsMock.mockReset();
    listAscAppsMock.mockResolvedValue([
      { appStoreId: 'asc-111', name: 'Discovered App One', bundleId: 'com.example.one' },
      { appStoreId: 'asc-222', name: 'Discovered App Two', bundleId: 'com.example.two' },
    ]);
  });

  it('first call creates 2 draft rows, created.length===2, existing.length===0', async () => {
    const result = await discoverApps();
    expect(result.created).toHaveLength(2);
    expect(result.existing).toHaveLength(0);
  });

  it('created rows have status==="draft" and no publishedAt / lastSyncedAt', async () => {
    const result = await discoverApps();
    for (const id of result.created) {
      const app = await getApp(id);
      expect(app).not.toBeNull();
      expect(app!.status).toBe('draft');
      expect(app!.publishedAt).toBeNull();
      // Proof that discover does NOT call sync/publish:
      // If syncApp or publishApp were called, lastSyncedAt and publishedAt would be set.
      expect((app as Record<string, unknown>).lastSyncedAt ?? null).toBeNull();
    }
  });

  it('second call is idempotent: created.length===0, existing.length===2', async () => {
    // First call populates the DB
    await discoverApps();
    // Second call — same mock returns same 2 apps
    const result2 = await discoverApps();
    expect(result2.created).toHaveLength(0);
    expect(result2.existing).toHaveLength(2);
  });
});
