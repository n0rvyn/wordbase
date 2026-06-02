import { eq, desc, asc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';
import { listAscApps } from './asc.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toJsonString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    // Validate it's valid JSON
    JSON.parse(v);
    return v;
  }
  if (typeof v === 'object') {
    return JSON.stringify(v);
  }
  throw new Error(`Cannot convert value to JSON string: ${typeof v}`);
}

interface ListAppsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listApps(options: ListAppsOptions = {}) {
  const { status, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const where = status ? eq(apps.status, status) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apps)
    .where(where);
  const total = countResult.count;

  const data = await db
    .select()
    .from(apps)
    .where(where)
    .orderBy(asc(apps.sortOrder), desc(apps.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, total, page, limit };
}

export async function getApp(idOrSlug: string) {
  const [byId] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, idOrSlug))
    .limit(1);
  if (byId) return byId;

  const [bySlug] = await db
    .select()
    .from(apps)
    .where(eq(apps.slug, idOrSlug))
    .limit(1);
  return bySlug || null;
}

interface CreateAppData {
  name: string;
  slug?: string;
  tagline?: string;
  icon?: string;
  description?: string;
  appStoreUrl?: string;
  appStoreId?: string;
  bundleId?: string;
  platform?: string;
  price?: string;
  rating?: number | null;
  ratingCount?: number;
  accentColor?: string;
  features?: unknown;
  screenshots?: unknown;
  links?: unknown;
  status?: string;
  sortOrder?: number;
  meta?: string;
}

export async function createApp(data: CreateAppData) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const slug = data.slug || slugify(data.name) || id;

  const [app] = await db
    .insert(apps)
    .values({
      id,
      slug,
      name: data.name,
      tagline: data.tagline ?? null,
      icon: data.icon ?? null,
      description: data.description ?? null,
      appStoreUrl: data.appStoreUrl ?? null,
      appStoreId: data.appStoreId ?? null,
      bundleId: data.bundleId ?? null,
      platform: data.platform || 'iOS',
      price: data.price ?? null,
      rating: data.rating ?? null,
      ratingCount: data.ratingCount ?? null,
      accentColor: data.accentColor ?? null,
      features: toJsonString(data.features),
      screenshots: toJsonString(data.screenshots),
      links: toJsonString(data.links),
      status: data.status || 'draft',
      sortOrder: data.sortOrder ?? 0,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      meta: data.meta ?? null,
    })
    .returning();

  return app;
}

export async function updateApp(id: string, data: Partial<CreateAppData>) {
  const now = Math.floor(Date.now() / 1000);
  const updateValues: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.tagline !== undefined) updateValues.tagline = data.tagline;
  if (data.icon !== undefined) updateValues.icon = data.icon;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.appStoreUrl !== undefined) updateValues.appStoreUrl = data.appStoreUrl;
  if (data.appStoreId !== undefined) updateValues.appStoreId = data.appStoreId;
  if (data.bundleId !== undefined) updateValues.bundleId = data.bundleId;
  if (data.platform !== undefined) updateValues.platform = data.platform;
  if (data.price !== undefined) updateValues.price = data.price;
  if (data.rating !== undefined) updateValues.rating = data.rating;
  if (data.ratingCount !== undefined) updateValues.ratingCount = data.ratingCount;
  if (data.accentColor !== undefined) updateValues.accentColor = data.accentColor;
  if (data.features !== undefined) updateValues.features = toJsonString(data.features);
  if (data.screenshots !== undefined) updateValues.screenshots = toJsonString(data.screenshots);
  if (data.links !== undefined) updateValues.links = toJsonString(data.links);
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;
  if (data.meta !== undefined) updateValues.meta = data.meta;

  const [app] = await db
    .update(apps)
    .set(updateValues)
    .where(eq(apps.id, id))
    .returning();

  return app || null;
}

export async function deleteApp(id: string) {
  const [deleted] = await db.delete(apps).where(eq(apps.id, id)).returning();
  return deleted || null;
}

export async function publishApp(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [app] = await db
    .update(apps)
    .set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(apps.id, id))
    .returning();
  return app || null;
}

/**
 * True when an error is the `ux_apps_app_store_id` unique-index violation (issue #2),
 * as opposed to any other constraint (e.g. the slug unique index). Used to tell a
 * lost discover race apart from a genuine failure.
 */
export function isAppStoreIdConflict(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const message = e?.message ?? '';
  const isUnique = e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(message);
  return isUnique && /app_store_id/i.test(message);
}

/**
 * Discover apps from ASC and idempotently create draft rows for new ones.
 * Existing apps (matched by appStoreId) are NOT modified.
 * No sync, no publish — discovery creates DRAFTS only.
 * Throws ASC_NOT_CONFIGURED if ASC credentials are absent.
 *
 * Concurrency (issue #2): the SELECT-then-INSERT below is a TOCTOU window — two
 * overlapping discover calls could both miss the SELECT. The ux_apps_app_store_id
 * unique index is the real guarantee; here we catch the resulting conflict and
 * reclassify the losing insert as "existing" instead of surfacing an error.
 */
export async function discoverApps(): Promise<{ created: string[]; existing: string[] }> {
  const ascApps = await listAscApps();
  const created: string[] = [];
  const existing: string[] = [];

  for (const entry of ascApps) {
    const [found] = await db
      .select()
      .from(apps)
      .where(eq(apps.appStoreId, entry.appStoreId))
      .limit(1);

    if (found) {
      existing.push(found.id);
      continue;
    }

    try {
      const app = await createApp({
        name: entry.name,
        appStoreId: entry.appStoreId,
        bundleId: entry.bundleId ?? undefined,
        status: 'draft',
      });
      created.push(app.id);
    } catch (err) {
      if (!isAppStoreIdConflict(err)) throw err;
      // A concurrent discover (or a row inserted between our SELECT and INSERT)
      // already created this app — re-read and count it as existing.
      const [raced] = await db
        .select()
        .from(apps)
        .where(eq(apps.appStoreId, entry.appStoreId))
        .limit(1);
      if (raced) existing.push(raced.id);
    }
  }

  return { created, existing };
}
