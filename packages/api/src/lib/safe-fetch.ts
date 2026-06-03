import dns from 'node:dns/promises';
import net from 'node:net';

// SSRF guard for server-side fetches of user-supplied URLs (podcast_import_feed,
// podcast_upload_audio_from_url). Blocks loopback/private/link-local targets so an
// authenticated caller can't make the API reach cloud metadata, localhost admin
// endpoints, or the private network. Redirects are followed manually and every hop
// is re-validated.

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127) return true; // "this" network, loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    // IPv4-mapped (::ffff:a.b.c.d) — re-check as IPv4
    const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    if (lower.startsWith('fe80')) return true; // link-local
    return false;
  }
  return true; // unparseable → treat as unsafe
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  if (u.username || u.password) {
    throw new Error('URL must not contain credentials');
  }
  // URL.hostname keeps brackets around IPv6 literals ("[::1]") and may carry a
  // trailing dot ("host."); strip both before the IP / DNS checks.
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('URL targets a private address');
    return u;
  }
  const results = await dns.lookup(host, { all: true });
  if (results.length === 0) throw new Error('URL host did not resolve');
  for (const r of results) {
    if (isPrivateIp(r.address)) throw new Error('URL targets a private address');
  }
  return u;
}

// fetch() with SSRF validation and manual redirect re-validation. Note: this does a
// resolve-then-fetch, so it does not fully defeat active DNS rebinding; it blocks the
// common SSRF cases and every redirect hop. Callers are already scope-gated.
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(url);
    const resp = await fetch(url, { ...init, redirect: 'manual' });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (location) {
        url = new URL(location, url).toString();
        continue;
      }
    }
    return resp;
  }
  throw new Error('Too many redirects');
}
