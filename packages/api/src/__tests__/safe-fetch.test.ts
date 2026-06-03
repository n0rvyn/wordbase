import { describe, it, expect } from 'vitest';
import { isPrivateIp, assertPublicUrl } from '../lib/safe-fetch.js';

describe('isPrivateIp', () => {
  it('flags loopback / private / link-local / metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('gopher://x')).rejects.toThrow();
  });

  it('rejects embedded credentials', async () => {
    await expect(assertPublicUrl('http://user:pass@8.8.8.8/')).rejects.toThrow(/credential/i);
  });

  it('rejects private/loopback IP literals without a DNS lookup', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/admin')).rejects.toThrow(/private/i);
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private/i);
    await expect(assertPublicUrl('http://[::1]:8080/')).rejects.toThrow(/private/i);
  });

  it('accepts a public IP literal', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/feed.xml')).resolves.toBeInstanceOf(URL);
  });
});
