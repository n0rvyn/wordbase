/**
 * App Sync Service
 * Merges metadata from iTunes Lookup + App Store Connect and writes back to the apps table.
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
import { lookupAppAnyStorefront, lookupEnCopy, type EnStoreCopy } from './appstore-lookup.service.js';
import { isAscConfigured, fetchAppMetadata } from './asc.service.js';

/**
 * Merge the English storefront's copy into an app's `meta` JSON under
 * `i18n.en`, leaving every other key alone.
 *
 * `meta` is an editorial free-form column that `app_update` can also write, so
 * this merges rather than replaces. A null `en` REMOVES the key: the app is no
 * longer listed on the English storefront, and keeping the last copy we saw
 * would have /en quoting a listing that no longer exists.
 *
 * Unparseable existing meta is treated as absent rather than thrown on — a bad
 * hand-edited row must not be able to break every sync that follows.
 */
export function mergeEnCopyIntoMeta(currentMeta: string | null, en: EnStoreCopy | null): string | null {
  let base: Record<string, unknown> = {};
  if (currentMeta) {
    try {
      const parsed = JSON.parse(currentMeta);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // keep {}
    }
  }

  const i18nRaw = base.i18n;
  const i18n: Record<string, unknown> =
    i18nRaw && typeof i18nRaw === 'object' && !Array.isArray(i18nRaw)
      ? { ...(i18nRaw as Record<string, unknown>) }
      : {};

  if (en) i18n.en = en;
  else delete i18n.en;

  const next = { ...base };
  if (Object.keys(i18n).length > 0) next.i18n = i18n;
  else delete next.i18n;

  // An empty object is stored as null so `meta` stays null on apps that never
  // had one — otherwise every sync would report `meta` as a changed field.
  return Object.keys(next).length > 0 ? JSON.stringify(next) : null;
}

/** What a single sync actually changed. `fields` empty = the fetch succeeded but no value differed. */
export interface AppSyncChange {
  appId: string;
  slug: string;
  status: string;
  fields: string[];
  /**
   * Which storefront answered the iTunes lookup, or null when NO storefront
   * lists the app. A null here on a `published` row means the site is showing a
   * page for something nobody can install — worth unpublishing.
   */
  storefront: string | null;
}

export interface SyncResult {
  synced: number;
  failed: Array<{ appId: string; error: string }>;
  /** Per-app field-level changes. Empty `fields` = synced but nothing differed. */
  changes: AppSyncChange[];
}

// lastSyncedAt/updatedAt are written on every sync by construction, so they can
// never signal "something actually changed" — comparing them would make every
// sync look like a change and make the caller's rebuild decision meaningless.
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
    // name/appStoreUrl: the store is the source of truth for both. Before this,
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
    // Only rewritten when a storefront actually answered — an app iTunes cannot
    // find anywhere keeps its meta untouched, same as every other field here.
    meta: found ? mergeEnCopyIntoMeta(cur.meta, enCopy) : cur.meta,
    // sync timestamps
    lastSyncedAt: now,
    updatedAt: now,
  };

  // Diff BEFORE writing. Callers need to know whether anything actually moved:
  // a sync that changed nothing must not trigger a site rebuild, and `{ok:true}`
  // alone cannot tell "fetched and updated" from "fetched and everything matched".
  const fields = Object.entries(set)
    .filter(([k, v]) => !BOOKKEEPING_FIELDS.has(k) && v !== (cur as Record<string, unknown>)[k])
    .map(([k]) => k);

  await db.update(apps).set(set).where(eq(apps.id, appId));

  return { appId, slug: cur.slug, status: cur.status, fields, storefront: found?.storefront ?? null };
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
