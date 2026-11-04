import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { SITE_COPY_FIELDS } from './site-copy.js';
import { settings } from '../db/schema.js';

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  const result: Record<string, string> = {};
  rows.forEach(row => { result[row.key] = row.value; });
  return result;
}

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

export class SettingsValidationError extends Error {}

export async function updateSettings(data: Record<string, string>): Promise<Record<string, string>> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SettingsValidationError('Settings must be a string map');
  // Validate the complete request before writing anything, including generic/MCP callers.
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') throw new SettingsValidationError(`Setting ${key} must be text`);
    if (key.startsWith('site.copy.')) {
      const name = key.slice(10);
      const field = Object.hasOwn(SITE_COPY_FIELDS, name) ? SITE_COPY_FIELDS[name as keyof typeof SITE_COPY_FIELDS] : undefined;
      if (!field) throw new SettingsValidationError(`Unknown site copy field: ${key}`);
      if (value.length > field.maxLength) throw new SettingsValidationError(`${key} must be at most ${field.maxLength} characters`);
      if (/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) throw new SettingsValidationError(`${key} must be plain text`);
    }
    if (key === 'site.title' && (value.length > 100 || /[<>\x00-\x1F]/.test(value))) throw new SettingsValidationError('Site title must be plain text, at most 100 characters');
  }
  const now = Math.floor(Date.now() / 1000);

  db.transaction(tx => {
    for (const [key, value] of Object.entries(data)) {
      tx.insert(settings).values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } }).run();
    }
  });

  return getSettings();
}
