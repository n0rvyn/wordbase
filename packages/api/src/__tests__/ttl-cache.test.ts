import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, cachedSync, clearCache, setCacheEnabled } from '../lib/ttl-cache.js';

describe('ttl-cache', () => {
  beforeEach(() => { setCacheEnabled(true); clearCache(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); setCacheEnabled(false); });

  it('miss then hit within TTL invokes fn once', async () => {
    const fn = vi.fn(async () => 'v1');
    expect(await cached('k', 1000, fn)).toBe('v1');
    expect(await cached('k', 1000, fn)).toBe('v1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-invokes fn after TTL expires', async () => {
    const fn = vi.fn(async () => 'v');
    await cached('k', 1000, fn);
    vi.advanceTimersByTime(1001);
    await cached('k', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('isolates distinct keys', async () => {
    const fn = vi.fn(async (n: number) => n);
    await cached('a', 1000, () => fn(1));
    await cached('b', 1000, () => fn(2));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clearCache drops entries', async () => {
    const fn = vi.fn(async () => 'v');
    await cached('k', 1000, fn);
    clearCache();
    await cached('k', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes through when disabled (no memoization)', async () => {
    setCacheEnabled(false);
    const fn = vi.fn(async () => 'v');
    await cached('k', 1000, fn);
    await cached('k', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cachedSync returns T directly and memoizes within TTL', () => {
    const fn = vi.fn(() => ({ ok: true }));
    const a = cachedSync('s', 1000, fn);
    const b = cachedSync('s', 1000, fn);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });   // not a Promise
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    cachedSync('s', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
