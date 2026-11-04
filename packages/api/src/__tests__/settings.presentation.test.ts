import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { apiKeys, settings } from '../db/schema.js';
import { updateSettings, getSettings } from '../services/settings.service.js';
import { getSiteIdentity } from '../services/site.service.js';
vi.mock('../services/build.service.js', () => ({ triggerBuild: vi.fn().mockResolvedValue({ status: 'requested' }), getBuildStatus: vi.fn() }));
const { app } = await import('../app.js');
const { triggerBuild } = await import('../services/build.service.js');
const key = 'wb-copy-test-only';
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
beforeAll(async () => {
  await db.insert(apiKeys).values({ id: 'copy-test', name: 'test', keyPrefix: key.slice(0,8), keyHash: await bcrypt.hash(key, 4), permissions: '["settings:write"]', createdAt: 1 });
  const readKey = 'wb-read-copy-only';
  await db.insert(apiKeys).values({ id: 'copy-read-test', name: 'read test', keyPrefix: readKey.slice(0,8), keyHash: await bcrypt.hash(readKey, 4), permissions: '["settings:read"]', createdAt: 1 });
});
afterEach(async () => { await db.delete(settings); vi.clearAllMocks(); });
describe('protected presentation settings', () => {
  it('persists admin edits, resolves them publicly and queues publishing with the existing scope', async () => {
    const response = await app.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ 'site.title': 'Julian', 'site.copy.headline': 'Hello world', 'site.copy.shareTitleZh': '你好 · Julian', 'site.copy.shareDescriptionEn': 'A short introduction.' }) });
    expect(response.status).toBe(200);
    expect(triggerBuild).toHaveBeenCalledOnce();
    expect((await getSettings())['site.copy.headline']).toBe('Hello world');
    const publicResponse = await app.request('/api/settings/site');
    const identity = await publicResponse.json() as { name: string; copy: Record<string, string> };
    expect(identity.name).toBe('Julian');
    expect(identity.copy.headline).toBe('Hello world');
    expect(identity.copy.shareTitleZh).toBe('你好 · Julian');
    expect(identity.copy.shareDescriptionEn).toBe('A short introduction.');
  });
  it('denies unauthenticated writes and does not queue them', async () => {
    const r = await app.request('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401); expect(triggerBuild).not.toHaveBeenCalled();
  });
  it('denies writes with only settings:read', async () => {
    const r = await app.request('/api/settings', { method: 'PUT', headers: { ...headers, Authorization: 'Bearer wb-read-copy-only' }, body: '{}' });
    expect(r.status).toBe(403); expect(triggerBuild).not.toHaveBeenCalled();
  });
  it('rejects invalid input before any setting changes', async () => {
    for (const data of [{ 'site.title': 'Changed', 'site.copy.headline': '<script>x</script>' }, { 'site.copy.headline': 'x'.repeat(101) }, { 'site.copy.unknown': 'x' }, { 'site.copy.constructor': 'x' }, { 'site.copy.headline': 8 }, []]) {
      const r = await app.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify(data) });
      expect(r.status).toBe(400); expect(await getSettings()).toEqual({});
    }
    expect(triggerBuild).not.toHaveBeenCalled();
  });
  it('uses current defaults after clearing copy and never exposes private settings', async () => {
    await updateSettings({ 'site.copy.headline': '  ', 'private.token': 'not-public' });
    const id = await getSiteIdentity();
    expect(id.copy?.headline).toBe('A curious mind.');
    expect(JSON.stringify(id)).not.toContain('not-public');
  });
  it('reports persisted-but-not-queued failure truthfully', async () => {
    vi.mocked(triggerBuild).mockResolvedValueOnce({ status: 'failed', error: 'marker unavailable', startedAt: null, completedAt: null, duration: null });
    const r = await app.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ 'site.copy.headline': 'Saved' }) });
    expect(r.status).toBe(503); expect((await getSiteIdentity()).copy?.headline).toBe('Saved');
  });
});
