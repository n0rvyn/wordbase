import { describe, it, expect, vi, beforeEach } from 'vitest';

// app_sync merged app_sync_all (id optional) and took over the site rebuild the
// MCP adapter had been missing. That omission was the #1 reported failure —
// "I synced but the page still shows the old version" — because `/apps/*` is
// static Astro output, so a DB-only sync is invisible until the site rebuilds.
//
// These pin the rebuild DECISION, which is the part that was wrong and the part
// no test covered: rebuild iff a PUBLISHED app actually changed. A sync that
// changed nothing must not rebuild (otherwise the trigger carries no signal),
// and a draft app changing must not rebuild (it renders no public page).

const syncApp = vi.fn();
const syncAllApps = vi.fn();
const triggerBuild = vi.fn();

vi.mock('../services/app-sync.service.js', () => ({
  syncApp: (...a: unknown[]) => syncApp(...a),
  syncAllApps: (...a: unknown[]) => syncAllApps(...a),
}));
vi.mock('../services/build.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/build.service.js')>();
  return { ...original, triggerBuild: (...a: unknown[]) => triggerBuild(...a) };
});

const { registerTools } = await import('../mcp/tools.js');

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function handler(): Handler {
  const handlers = new Map<string, Handler>();
  const server = {
    tool(name: string, _d: string, _s: unknown, h: Handler) {
      handlers.set(name, h);
    },
  };
  registerTools(server as never, ['*']);
  return handlers.get('app_sync')!;
}

const change = (over: Partial<{ status: string; fields: string[]; slug: string }> = {}) => ({
  appId: 'app1',
  slug: over.slug ?? 'delphi',
  status: over.status ?? 'published',
  fields: over.fields ?? ['version'],
});

beforeEach(() => {
  syncApp.mockReset();
  syncAllApps.mockReset();
  triggerBuild.mockReset();
});

describe('app_sync rebuild decision', () => {
  it('rebuilds when a published app actually changed', async () => {
    syncApp.mockResolvedValue(change({ status: 'published', fields: ['version', 'icon'] }));
    const res = await handler()({ id: 'app1' });
    expect(triggerBuild).toHaveBeenCalledTimes(1);
    expect(JSON.parse(res.content[0].text).rebuildTriggered).toBe(true);
  });

  it('does NOT rebuild when the sync changed nothing', async () => {
    syncApp.mockResolvedValue(change({ status: 'published', fields: [] }));
    const res = await handler()({ id: 'app1' });
    expect(triggerBuild).not.toHaveBeenCalled();
    const body = JSON.parse(res.content[0].text);
    expect(body.rebuildTriggered).toBe(false);
    // "nothing changed" must be visible, not indistinguishable from "did work".
    expect(body.unchanged).toContain('delphi');
    expect(body.changed).toEqual([]);
  });

  it('does NOT rebuild when only a draft app changed (renders no public page)', async () => {
    syncApp.mockResolvedValue(change({ status: 'draft', fields: ['version'] }));
    await handler()({ id: 'app1' });
    expect(triggerBuild).not.toHaveBeenCalled();
  });
});

describe('app_sync scope selection', () => {
  it('given an id, syncs that one app only', async () => {
    syncApp.mockResolvedValue(change({ fields: [] }));
    const res = await handler()({ id: 'app1' });
    expect(syncApp).toHaveBeenCalledWith('app1');
    expect(syncAllApps).not.toHaveBeenCalled();
    expect(JSON.parse(res.content[0].text).scope).toBe('one');
  });

  it('omitting id syncs every app and surfaces per-app failures', async () => {
    syncAllApps.mockResolvedValue({
      synced: 2,
      failed: [{ appId: 'bad', error: 'no appStoreId' }],
      changes: [change({ fields: ['version'] }), change({ slug: 'cashie', fields: [] })],
    });
    const res = await handler()({});
    expect(syncAllApps).toHaveBeenCalled();
    expect(syncApp).not.toHaveBeenCalled();
    const body = JSON.parse(res.content[0].text);
    expect(body.scope).toBe('all');
    expect(body.failed).toHaveLength(1);
    expect(body.changed).toHaveLength(1);
    expect(body.unchanged).toEqual(['cashie']);
    expect(triggerBuild).toHaveBeenCalledTimes(1);
  });

  it('surfaces a sync failure as isError instead of a silent success', async () => {
    syncApp.mockRejectedValue(new Error('App not found: nope'));
    const res = await handler()({ id: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('App not found');
    expect(triggerBuild).not.toHaveBeenCalled();
  });
});
