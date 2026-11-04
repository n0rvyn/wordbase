import { sql, type SQLWrapper } from 'drizzle-orm';
import { isIP } from 'node:net';
import { pageViews } from '../db/schema.js';
import { hashIp } from './hash-ip.js';

/** Normalize the supplied forwarding header, not a verification of proxy trust.
 * Local/private/sentinel addresses cannot establish an end visitor's identity. */
export function normalizeAnalyticsIp(
  value: string | null | undefined,
): string | undefined {
  let ip = value?.split(',')[0]?.trim().toLowerCase();
  if (!ip) return undefined;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!isIP(ip)) return undefined;
  if (ip.includes(':'))
    return ip === '::' || ip === '::1' || /^(fc|fd|fe[89ab])/.test(ip)
      ? undefined
      : ip;
  const [a, b] = ip.split('.').map(Number);
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
    ? undefined
    : ip;
}
export function normalizeAnalyticsAgent(
  value: string | null | undefined,
): string | undefined {
  const text = value?.trim();
  return !text || text.toLowerCase() === 'unknown' ? undefined : text;
}
// Historical rows stay untouched. We can recognize common sentinel/loopback
// hashes, but arbitrary historical private-IP hashes cannot be recovered.
const invalidHashes = [
  'unknown',
  '',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
].map(hashIp);
export function usableIpHashSql(column: SQLWrapper) {
  return sql<
    string | null
  >`case when ${column} is not null and ${column} <> '' and ${column} not in (${sql.join(
    invalidHashes.map((h) => sql`${h}`),
    sql`,`,
  )}) then ${column} end`;
}
export const visitorKeySql = sql<
  string | null
>`coalesce(nullif(trim(${pageViews.visitorId}),''),${usableIpHashSql(pageViews.ipHash)})`;
export const unknownAgentSql = sql`(${pageViews.userAgent} is null or trim(${pageViews.userAgent})='' or lower(trim(${pageViews.userAgent}))='unknown')`;
export const isBotSql = sql`(${pageViews.userAgent} is not null and (
 lower(${pageViews.userAgent}) like '%bot%' or lower(${pageViews.userAgent}) like '%spider%'
 or lower(${pageViews.userAgent}) like '%crawl%' or lower(${pageViews.userAgent}) like '%facebookexternalhit%'
 or lower(${pageViews.userAgent}) like '%curl/%' or lower(${pageViews.userAgent}) like '%wget%'
 or lower(${pageViews.userAgent}) like '%python-requests%' or lower(${pageViews.userAgent}) like '%go-http-client%'
 or lower(${pageViews.userAgent}) like '%node-fetch%' or lower(${pageViews.userAgent}) like '%headlesschrome%'
 or lower(${pageViews.userAgent}) like '%slurp%'))`;
