/** Apple data is an import suggestion, never the source of the public catalog. */
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appImports, apps, type App } from '../db/schema.js';
import { mergeEnCopyIntoMeta } from './app-import-merge.js';
import type { EnStoreCopy } from './appstore-lookup.service.js';

export const IMPORT_FIELDS = [
  'name', 'appStoreUrl', 'rating', 'ratingCount', 'subtitle', 'whatsNew', 'category',
  'version', 'platform', 'screenshots', 'releaseDate', 'currentVersionReleaseDate',
  'minimumOsVersion', 'price', 'icon', 'description', 'englishCopy',
] as const;
const allowed = new Set<string>(IMPORT_FIELDS);
const MAX_AGE = 7 * 24 * 60 * 60;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class AppImportError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_REVIEW' | 'STALE_IMPORT', message: string) { super(message); }
}

function englishCopy(app: App): unknown {
  try { return JSON.parse(app.meta ?? '{}')?.i18n?.en ?? null; } catch { return null; }
}

export function prepareAppImport(app: App, changes: Record<string, unknown>, storefront: string | null) {
  const fields = Object.keys(changes);
  if (!fields.length) return null;
  if (fields.some((field) => !allowed.has(field))) throw new AppImportError('INVALID_REVIEW', 'Unsupported import field');
  const baseHash = hash(app);
  const payload = {
    storefront,
    changes: Object.fromEntries(fields.map((field) => [field, {
      before: field === 'englishCopy' ? englishCopy(app) : app[field as keyof App],
      after: changes[field],
    }])),
  };
  const now = Math.floor(Date.now() / 1000);
  const serialized = JSON.stringify(payload);
  const id = db.transaction((tx) => {
    // Reuse fresh pending proposals only. A new ID after expiry guarantees an
    // old review cannot become valid again when the same Apple values recur.
    const existing = tx.select().from(appImports).where(and(
      eq(appImports.appId, app.id), eq(appImports.baseHash, baseHash),
      eq(appImports.payload, serialized), eq(appImports.status, 'pending'),
      gte(appImports.createdAt, now - MAX_AGE),
    )).get();
    if (existing) return existing.id;
    const id = nanoid();
    tx.insert(appImports).values({ id, appId: app.id, baseHash, payload: serialized, createdAt: now }).run();
    return id;
  });
  return getAppImport(id);
}

function present(row: typeof appImports.$inferSelect) {
  return { ...row, reviewToken: row.baseHash, ...JSON.parse(row.payload), payload: undefined };
}

export function getAppImport(id: string) {
  const row = db.select().from(appImports).where(eq(appImports.id, id)).get();
  return row ? present(row) : null;
}

export function listAppImports(appId?: string) {
  return db.select().from(appImports)
    .where(appId ? and(eq(appImports.status, 'pending'), eq(appImports.appId, appId)) : eq(appImports.status, 'pending'))
    .orderBy(desc(appImports.createdAt)).limit(100).all().map(present);
}

/** Only server-stored, explicitly selected values can be applied. The transaction
 * checks the complete row hash, not second-resolution updatedAt, so concurrent
 * editorial edits cannot be lost even when both happen within the same second. */
export function reviewAppImport(id: string, reviewToken: string, fields: string[], action: 'apply' | 'reject') {
  return db.transaction((tx) => {
    const proposal = tx.select().from(appImports).where(eq(appImports.id, id)).get();
    if (!proposal) throw new AppImportError('NOT_FOUND', 'Import proposal not found');
    if (proposal.status !== 'pending') throw new AppImportError('STALE_IMPORT', 'This import has already been reviewed');
    if (typeof reviewToken !== 'string' || reviewToken !== proposal.baseHash) throw new AppImportError('INVALID_REVIEW', 'Read the proposal and pass its reviewToken');
    if (action !== 'apply' && action !== 'reject') throw new AppImportError('INVALID_REVIEW', 'Action must be apply or reject');
    const now = Math.floor(Date.now() / 1000);
    const current = tx.select().from(apps).where(eq(apps.id, proposal.appId)).get();
    if (!current) throw new AppImportError('NOT_FOUND', 'App not found');
    if (action === 'reject') {
      tx.update(appImports).set({ status: 'rejected', reviewedAt: now }).where(eq(appImports.id, id)).run();
      return { appId: current.id, status: current.status, action, applied: [] as string[] };
    }
    if (now - proposal.createdAt > MAX_AGE || hash(current) !== proposal.baseHash) throw new AppImportError('STALE_IMPORT', 'Catalog changed or import expired; fetch a fresh proposal and review again');
    const { changes } = JSON.parse(proposal.payload) as { changes: Record<string, { after: unknown }> };
    if (!Array.isArray(fields) || !fields.length || fields.some((field) => typeof field !== 'string' || !allowed.has(field) || !Object.hasOwn(changes, field))) {
      throw new AppImportError('INVALID_REVIEW', 'Select at least one changed field from this proposal');
    }
    const set: Record<string, unknown> = { updatedAt: now, lastSyncedAt: now };
    for (const field of new Set(fields)) {
      if (field === 'englishCopy') set.meta = mergeEnCopyIntoMeta(current.meta, changes[field].after as EnStoreCopy | null);
      else set[field] = changes[field].after;
    }
    tx.update(apps).set(set).where(eq(apps.id, current.id)).run();
    tx.update(appImports).set({ status: 'applied', reviewedAt: now }).where(eq(appImports.id, id)).run();
    return { appId: current.id, status: current.status, action, applied: [...new Set(fields)] };
  });
}
