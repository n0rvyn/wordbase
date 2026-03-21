import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { initializeDatabase } from '../db/index.js';

export async function generateKey(name: string, permissions: string[]) {
  initializeDatabase();

  // Generate a 32-char random key
  const rawKey = 'wb_' + crypto.randomBytes(24).toString('base64url');
  const prefix = rawKey.slice(0, 8);
  const hash = await bcrypt.hash(rawKey, 10);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(apiKeys).values({
    id,
    name,
    keyPrefix: prefix,
    keyHash: hash,
    permissions: JSON.stringify(permissions),
    createdAt: now,
  });

  console.log(`API key created for "${name}":`);
  console.log(`  Key: ${rawKey}`);
  console.log(`  Permissions: ${permissions.join(', ')}`);
  console.log('');
  console.log('Save this key - it will not be shown again.');

  return rawKey;
}

export async function regenerateKey(name: string) {
  initializeDatabase();

  const { eq } = await import('drizzle-orm');
  const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.name, name)).limit(1);
  if (!existing) {
    console.error(`No key found with name "${name}"`);
    process.exit(1);
  }

  const rawKey = 'wb_' + crypto.randomBytes(24).toString('base64url');
  const prefix = rawKey.slice(0, 8);
  const hash = await bcrypt.hash(rawKey, 10);

  await db.update(apiKeys).set({
    keyPrefix: prefix,
    keyHash: hash,
  }).where(eq(apiKeys.id, existing.id));

  console.log(`API key regenerated for "${name}":`);
  console.log(`  Key: ${rawKey}`);
  console.log('');
  console.log('Save this key - it will not be shown again.');

  return rawKey;
}
