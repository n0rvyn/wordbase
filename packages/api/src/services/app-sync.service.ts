/**
 * App Sync Service
 * Fetches metadata from Apple and proposes a reviewed import. NEVER updates the curated app row.
 *
 * Merge precedence:
 *   rating/ratingCount: ALWAYS from iTunes
 *   subtitle/whatsNew: from ASC (falls back to cur.{field})
 *   category/version/screenshots: ASC-first, then iTunes, then cur.{field}
 *   name/appStoreUrl: iTunes (trackName/trackViewUrl), then cur.{field}
 *   rest: iTunes, then cur.{field}
 *
 * Every field falls back to cur.{field} to never wipe manually-entered data.
 */

import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';
import { prepareAppImport } from './app-import.service.js';
import { lookupAppAnyStorefront, lookupEnCopy, type EnStoreCopy } from './appstore-lookup.service.js';
import { isAscConfigured, fetchAppMetadata } from './asc.service.js';

import { mergeEnCopyIntoMeta } from './app-import-merge.js';
export { mergeEnCopyIntoMeta } from './app-import-merge.js';

/** Proposed changes only. `fields` empty means the fetched values matched. */
export interface AppSyncChange {
  appId: string;
  slug: string;
  status: string;
  fields: string[];
  /**
   * Which queried storefront answered (CN, then US), or null when neither did.
   * This is not a global availability verdict and never changes publication.
   */
  storefront: string | null;
  mode: 'review_required';
  proposalId: string | null;
}

export interface SyncResult {
  synced: number;
  failed: Array<{ appId: string; error: string }>;
  /** Per-app suggestions. No public app values have been changed. */
  changes: AppSyncChange[];
}

// Fetch timestamps are bookkeeping, never proposed display changes. Catalog
// timestamps move only after an explicit reviewed apply.
const BOOKKEEPING_FIELDS = new Set(['lastSyncedAt', 'updatedAt']);

export async function syncApp(appId: string): Promise<AppSyncChange> {
  // Load the app
  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) {
    throw new Error(`App not found: ${appId}`);
  }

  if (!app.appStoreId) {
    throw new Error(`App ${appId} has no appStoreId — cannot sync`);
  }

  const cur = app;
  const now = Math.floor(Date.now() / 1000);

  // Fetch iTunes data. Tries cn, then us: an app without a mainland ICP filing
  // is missing from the CN storefront while being live elsewhere, and checking
  // only cn would wipe it to "not released".
  const found = await lookupAppAnyStorefront(app.appStoreId);
  const itunes = found?.meta ?? null;

  // English copy for /en. The row's own name/description/price are whichever
  // storefront answered first (cn for every live app today), so without this
  // the English site shows Chinese store copy — and for id 6760798981 it showed
  // a name that does not exist in the English store at all. Only fetched when
  // the app is listed somewhere; a lookup failure throws and fails the sync
  // rather than silently wiping the overlay.
  const enCopy = found ? await lookupEnCopy(app.appStoreId, found.storefront) : null;

  // Fetch ASC data (gracefully degrade if not configured or fails)
  const asc = isAscConfigured()
    ? await fetchAppMetadata(app.appStoreId).catch((e) => {
        console.warn('[app-sync] ASC fetchAppMetadata failed:', e instanceof Error ? e.message : e);
        return null;
      })
    : null;

  // screenshots: prefer ASC only when non-empty (empty ASC must not shadow iTunes — Task 3 harden)
  const rawShots = (asc?.screenshots && asc.screenshots.length > 0) ? asc.screenshots : itunes?.screenshots;
  const screenshots = rawShots != null && rawShots.length > 0
    ? JSON.stringify(rawShots)
    : cur.screenshots;

  const set = {
    // Candidate name/appStoreUrl come from Apple; the curated row remains authoritative. Before this,
    // `name` was written once by discoverApps and never refreshed, so a rename
    // on the App Store never reached the site (Cashie, Activity Bridge, Delphi,
    // Model Proxy all drifted); `appStoreUrl` was never written at all, which
    // left every "App Store ↗" affordance gated on an always-null field. Both fall
    // back to cur.* so an app iTunes cannot find (e.g. a Mac app absent from
    // the CN storefront) keeps what it has.
    name: itunes?.name ?? cur.name,
    appStoreUrl: itunes?.appStoreUrl ?? cur.appStoreUrl,
    // rating/ratingCount: ALWAYS from iTunes
    rating: itunes?.rating ?? cur.rating,
    ratingCount: itunes?.ratingCount ?? cur.ratingCount,
    // subtitle/whatsNew: ASC-first, falls back to current (not cleared)
    subtitle: asc?.subtitle ?? cur.subtitle,
    whatsNew: asc?.whatsNew ?? cur.whatsNew,
    // category/version: ASC-first, then iTunes, then cur
    category: asc?.category ?? itunes?.category ?? cur.category,
    version: asc?.version ?? itunes?.version ?? cur.version,
    // platform: ASC-first, then iTunes, then cur
    platform: asc?.platform ?? itunes?.platform ?? cur.platform,
    // screenshots merged above
    screenshots,
    // rest from iTunes, fall back to cur
    releaseDate: itunes?.releaseDate ?? cur.releaseDate,
    currentVersionReleaseDate: itunes?.currentVersionReleaseDate ?? cur.currentVersionReleaseDate,
    minimumOsVersion: itunes?.minimumOsVersion ?? cur.minimumOsVersion,
    price: itunes?.price ?? cur.price,
    icon: itunes?.icon ?? cur.icon,
    description: itunes?.description ?? cur.description,
    // meta.i18n.en: the English storefront's copy, consumed by localizeApp.
    // A successful listing lookup may propose replacing/removing the English
    // overlay. Nothing changes until that particular field is reviewed.
    englishCopy: found ? enCopy : undefined,
    // sync timestamps
    lastSyncedAt: now,
    updatedAt: now,
  };

  // Build a field-level review diff. No candidate value is written into apps.
  const fields = Object.entries(set)
    .filter(([k, v]) => !BOOKKEEPING_FIELDS.has(k) && v !== undefined && (k === 'englishCopy'
      ? mergeEnCopyIntoMeta(cur.meta, v as EnStoreCopy | null) !== cur.meta
      : v !== (cur as Record<string, unknown>)[k]))
    .map(([k]) => k);

  const proposal = prepareAppImport(cur, Object.fromEntries(fields.map((key) => [key, (set as Record<string, unknown>)[key]])), found?.storefront ?? null);

  return { appId, slug: cur.slug, status: cur.status, fields, storefront: found?.storefront ?? null, mode: 'review_required', proposalId: proposal?.id ?? null };
}

export async function syncAllApps(): Promise<SyncResult> {
  const appList = await db
    .select()
    .from(apps)
    .where(isNotNull(apps.appStoreId));

  let synced = 0;
  const failed: Array<{ appId: string; error: string }> = [];
  const changes: SyncResult['changes'] = [];

  for (const app of appList) {
    try {
      const change = await syncApp(app.id);
      changes.push(change);
      synced++;
    } catch (err) {
      failed.push({
        appId: app.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, failed, changes };
}
