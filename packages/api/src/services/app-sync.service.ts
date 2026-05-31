/**
 * App Sync Service
 * Merges metadata from iTunes Lookup + App Store Connect and writes back to the apps table.
 *
 * Merge precedence:
 *   rating/ratingCount: ALWAYS from iTunes
 *   subtitle/whatsNew: from ASC (falls back to cur.{field})
 *   category/version/screenshots: ASC-first, then iTunes, then cur.{field}
 *   rest: iTunes, then cur.{field}
 *
 * Every field falls back to cur.{field} to never wipe manually-entered data.
 */

import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';
import { lookupApp } from './appstore-lookup.service.js';
import { isAscConfigured, fetchAppMetadata } from './asc.service.js';

export interface SyncResult {
  synced: number;
  failed: Array<{ appId: string; error: string }>;
}

export async function syncApp(appId: string): Promise<void> {
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

  // Fetch iTunes data
  const itunes = await lookupApp(app.appStoreId);

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
    // rating/ratingCount: ALWAYS from iTunes
    rating: itunes?.rating ?? cur.rating,
    ratingCount: itunes?.ratingCount ?? cur.ratingCount,
    // subtitle/whatsNew: ASC-first, falls back to current (not cleared)
    subtitle: asc?.subtitle ?? cur.subtitle,
    whatsNew: asc?.whatsNew ?? cur.whatsNew,
    // category/version: ASC-first, then iTunes, then cur
    category: asc?.category ?? itunes?.category ?? cur.category,
    version: asc?.version ?? itunes?.version ?? cur.version,
    // screenshots merged above
    screenshots,
    // rest from iTunes, fall back to cur
    releaseDate: itunes?.releaseDate ?? cur.releaseDate,
    currentVersionReleaseDate: itunes?.currentVersionReleaseDate ?? cur.currentVersionReleaseDate,
    minimumOsVersion: itunes?.minimumOsVersion ?? cur.minimumOsVersion,
    price: itunes?.price ?? cur.price,
    icon: itunes?.icon ?? cur.icon,
    description: itunes?.description ?? cur.description,
    // sync timestamps
    lastSyncedAt: now,
    updatedAt: now,
  };

  await db.update(apps).set(set).where(eq(apps.id, appId));
}

export async function syncAllApps(): Promise<SyncResult> {
  const appList = await db
    .select()
    .from(apps)
    .where(isNotNull(apps.appStoreId));

  let synced = 0;
  const failed: Array<{ appId: string; error: string }> = [];

  for (const app of appList) {
    try {
      await syncApp(app.id);
      synced++;
    } catch (err) {
      failed.push({
        appId: app.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, failed };
}
