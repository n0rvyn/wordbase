import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { redirects, posts } from '../db/schema.js';
import type { AppEnv } from '../types.js';

export const redirectMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path;
  const url = new URL(c.req.url);

  // Handle old WordPress ?p=ID URLs
  const wpId = url.searchParams.get('p');
  if (wpId) {
    // We don't store WP IDs, but we can search by creation order
    // For now, redirect ?p=xxx to homepage (safe fallback)
    return c.redirect('/', 301);
  }

  // Check redirect table
  const [redirect] = await db.select().from(redirects).where(eq(redirects.fromPath, path)).limit(1);
  if (redirect) {
    return c.redirect(redirect.toPath, (redirect.statusCode || 301) as 301 | 302 | 303 | 307 | 308);
  }

  // Also check with/without trailing slash
  const altPath = path.endsWith('/') ? path.slice(0, -1) : path + '/';
  const [altRedirect] = await db.select().from(redirects).where(eq(redirects.fromPath, altPath)).limit(1);
  if (altRedirect) {
    return c.redirect(altRedirect.toPath, (altRedirect.statusCode || 301) as 301 | 302 | 303 | 307 | 308);
  }

  await next();
});
