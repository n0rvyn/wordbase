import { createMiddleware } from 'hono/factory';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import type { AppEnv, AuthContext } from '../types.js';

// Reusable auth validation — returns AuthContext or null
export async function validateBearerToken(authHeader: string | undefined): Promise<AuthContext | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (token.length < 8) return null;

  const prefix = token.slice(0, 8);
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix)).limit(1);
  if (!key) return null;

  const valid = await bcrypt.compare(token, key.keyHash);
  if (!valid) return null;

  await db.update(apiKeys).set({ lastUsedAt: Math.floor(Date.now() / 1000) }).where(eq(apiKeys.id, key.id));

  return { keyId: key.id, permissions: JSON.parse(key.permissions) as string[] };
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = await validateBearerToken(c.req.header('Authorization'));
  if (!auth) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' } }, 401);
  }

  c.set('auth', auth);
  await next();
});
