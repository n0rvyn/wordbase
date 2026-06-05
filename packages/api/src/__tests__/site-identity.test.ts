import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import * as settingsService from '../services/settings.service.js';
import { getSiteIdentity } from '../services/site.service.js';

async function clearSettings() {
  await db.delete(settings);
}

beforeAll(async () => {
  await clearSettings();
});

afterEach(async () => {
  await clearSettings();
});

describe('getSiteIdentity', () => {
  it('returns the norvyn defaults when the settings table is empty', async () => {
    const id = await getSiteIdentity();
    expect(id.name).toBe('norvyn');
    expect(id.description).toBe('独立开发者，做 App、写字、录播客。');
    expect(id.author).toBe('norvyn');
    expect(id.email).toBe('norvyn@norvyn.com');
    expect(id.github).toBe('https://github.com/n0rvyn');
  });

  it('respects an admin-set site.title', async () => {
    await settingsService.updateSettings({ 'site.title': 'My Blog' });
    const id = await getSiteIdentity();
    expect(id.name).toBe('My Blog');
    // other fields still default
    expect(id.author).toBe('norvyn');
    expect(id.email).toBe('norvyn@norvyn.com');
  });

  it('falls back to the default when site.title is the WP legacy placeholder', async () => {
    await settingsService.updateSettings({ 'site.title': 'Wordbase Blog' });
    const id = await getSiteIdentity();
    expect(id.name).toBe('norvyn');
  });

  it('falls back to the default when site.description is the WP legacy placeholder', async () => {
    await settingsService.updateSettings({ 'site.description': 'A personal blog' });
    const id = await getSiteIdentity();
    expect(id.description).toBe('独立开发者，做 App、写字、录播客。');
  });

  it('ignores unknown keys and does not throw', async () => {
    await settingsService.updateSettings({ 'unknown.key': 'x' });
    const id = await getSiteIdentity();
    expect(id.name).toBe('norvyn');
    expect((id as unknown as Record<string, unknown>)['unknown.key']).toBeUndefined();
  });
});
