import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import {
  createApp,
  discoverApps,
  listApps,
  isAppStoreIdConflict,
} from '../services/app.service.js';

// discoverApps reads from ASC; mock it so we control the discovered set.
vi.mock('../services/asc.service.js', () => ({
  listAscApps: vi.fn(),
}));
import { listAscApps } from '../services/asc.service.js';
const listAscAppsMock = listAscApps as ReturnType<typeof vi.fn>;

beforeEach(resetNewTables);

describe('appStoreId uniqueness (issue #2)', () => {
  it('rejects a second app with the same non-null appStoreId, and the DB error is recognized as an appStoreId conflict', async () => {
    await createApp({ name: 'First', appStoreId: 'asc-dup' });

    let caught: unknown;
    try {
      await createApp({ name: 'Second', appStoreId: 'asc-dup' });
    } catch (e) {
      caught = e;
    }

    // The unique index enforces the invariant...
    expect(caught).toBeDefined();
    // ...and the real error is exactly what discoverApps's catch path keys on.
    expect(isAppStoreIdConflict(caught)).toBe(true);

    const { data } = await listApps();
    expect(data.filter((a) => a.appStoreId === 'asc-dup')).toHaveLength(1);
  });

  it('allows multiple apps with NULL appStoreId (manual apps are unaffected)', async () => {
    const a = await createApp({ name: 'Manual A' });
    const b = await createApp({ name: 'Manual B' });
    expect(a.appStoreId).toBeNull();
    expect(b.appStoreId).toBeNull();
    const { data } = await listApps();
    expect(data).toHaveLength(2);
  });

  it('discoverApps is idempotent: a second run creates nothing and leaves exactly one row', async () => {
    listAscAppsMock.mockReset();
    listAscAppsMock.mockResolvedValue([
      { appStoreId: 'asc-555', name: 'Idem App', bundleId: 'com.example.idem' },
    ]);

    const first = await discoverApps();
    expect(first.created).toHaveLength(1);
    expect(first.existing).toHaveLength(0);

    const second = await discoverApps();
    expect(second.created).toHaveLength(0);
    expect(second.existing).toHaveLength(1);

    const { data } = await listApps();
    expect(data.filter((a) => a.appStoreId === 'asc-555')).toHaveLength(1);
  });
});

describe('isAppStoreIdConflict', () => {
  it('matches the app_store_id unique violation', () => {
    expect(
      isAppStoreIdConflict({
        code: 'SQLITE_CONSTRAINT_UNIQUE',
        message: 'UNIQUE constraint failed: apps.app_store_id',
      })
    ).toBe(true);
  });

  it('does NOT match a slug unique violation (must not swallow it as "existing")', () => {
    expect(
      isAppStoreIdConflict({
        code: 'SQLITE_CONSTRAINT_UNIQUE',
        message: 'UNIQUE constraint failed: apps.slug',
      })
    ).toBe(false);
  });

  it('does not match unrelated errors', () => {
    expect(isAppStoreIdConflict(new Error('something else'))).toBe(false);
    expect(isAppStoreIdConflict(null)).toBe(false);
  });
});
