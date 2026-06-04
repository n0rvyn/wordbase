import { createHash } from 'crypto';

/** Stable, non-reversible 16-hex fingerprint of a client IP. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}
