// In-process TTL memoization for read-only dashboard aggregations.
// Transparent: cached values are byte-identical to the underlying fn's result.
// DISABLED by default under the test runner (VITEST / NODE_ENV=test) so suites
// that mutate-then-read the DB never see a stale memoized value; prod boots enabled.
//
// NOT single-flight: it does not coalesce concurrent misses of the SAME key. This
// is fine for the Observability panel — its first open fires 14 calls with 14
// DISTINCT keys (one per widget), so coalescing would save nothing; the optimized
// path is repeat opens / period toggles, which hit warm entries. If a future caller
// hammers one key concurrently, add an in-flight Promise map then.
type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
let enabled = !(process.env.VITEST || process.env.NODE_ENV === 'test');

export function setCacheEnabled(v: boolean): void {
  enabled = v;
}

export function clearCache(): void {
  store.clear();
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

// Synchronous variant: returns T directly (no Promise) so callers that invoke the
// wrapped function without `await` keep working. Used only for sync read functions
// (getSystemStatus / getSeoHealth).
export function cachedSync<T>(key: string, ttlMs: number, fn: () => T): T {
  if (!enabled) return fn();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = fn();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}
