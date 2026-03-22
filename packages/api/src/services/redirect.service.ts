import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { redirects } from '../db/schema.js';

export async function listRedirects() {
  return db.select().from(redirects);
}

export async function findRedirect(fromPath: string) {
  const [redirect] = await db.select().from(redirects).where(eq(redirects.fromPath, fromPath)).limit(1);
  return redirect || null;
}

export async function createRedirect(data: { fromPath: string; toPath: string; statusCode?: number }) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(redirects).values({
    id,
    fromPath: data.fromPath,
    toPath: data.toPath,
    statusCode: data.statusCode || 301,
    createdAt: now,
  }).returning();
  return record;
}

export async function deleteRedirect(id: string) {
  const [deleted] = await db.delete(redirects).where(eq(redirects.id, id)).returning();
  return deleted || null;
}
