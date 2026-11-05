import { describe, it, expect } from 'vitest';
import { allowedSiteOrigin, canonicalOrigin } from '../lib/site-origin.js';
import { app } from '../app.js';

describe('domain cutover origins', () => {
  it('uses the new canonical while accepting the old domain during compatibility', () => {
    expect(canonicalOrigin).toBe('https://julian.cafe');
    expect(allowedSiteOrigin('https://julian.cafe')).toBe('https://julian.cafe');
    expect(allowedSiteOrigin('https://norvyn.com')).toBe('https://norvyn.com');
  });
  it('does not accept lookalike domains or arbitrary origins', () => {
    expect(allowedSiteOrigin('https://julian.cafe.attacker.example')).toBeUndefined();
    expect(allowedSiteOrigin('https://unrelated.example')).toBeUndefined();
    expect(allowedSiteOrigin('http://julian.cafe')).toBeUndefined();
    expect(allowedSiteOrigin('null')).toBeUndefined();
  });
  it('retains local development and an explicitly configured runtime origin', () => {
    expect(allowedSiteOrigin('http://localhost:4321')).toBe('http://localhost:4321');
    expect(allowedSiteOrigin('http://127.0.0.1:4420')).toBe('http://127.0.0.1:4420');
    expect(allowedSiteOrigin('https://preview.example','https://preview.example')).toBe('https://preview.example');
  });
  it('serves real API preflights for both site origins without allowing strangers', async () => {
    for (const origin of ['https://julian.cafe','https://norvyn.com']) {
      const response = await app.request('/health', { method:'OPTIONS', headers:{ Origin:origin, 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'authorization,content-type' } });
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    }
    const denied = await app.request('/health', { headers:{Origin:'https://unrelated.example'} });
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
