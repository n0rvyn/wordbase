import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../paths.js';

const configured = JSON.parse(readFileSync(resolve(REPO_ROOT, 'content/site-origin.json'), 'utf8')) as {
  canonical: string; aliases: string[];
};
export const canonicalOrigin = new URL(configured.canonical).origin;
const siteOrigins = new Set([canonicalOrigin, ...configured.aliases.map(value => new URL(value).origin)]);

/** Only the site's explicitly configured domains, its runtime origin and local development. */
export function allowedSiteOrigin(origin: string, runtimeOrigin = process.env.SITE_URL): string | undefined {
  if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return siteOrigins.has(origin) || origin === runtimeOrigin ? origin : undefined;
}
