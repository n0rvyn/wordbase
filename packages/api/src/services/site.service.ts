import { getSettings } from './settings.service.js';

export interface SiteIdentity {
  name: string;
  description: string;
  author: string;
  email: string;
  github: string;
}

// DEFAULTS is the single source of truth for site identity. The description
// is the "site tagline" (drives llms.txt / RSS / Organization JSON-LD) and
// must match the prior #8 SITE_DESCRIPTION literal verbatim — preserving
// llms/RSS output. It is intentionally separate from the per-page meta
// description default in BaseLayout.astro (which stays as a literal English
// string and is NOT wired to id.description — see DP-001).
const DEFAULTS: SiteIdentity = {
  name: 'norvyn',
  description: '独立开发者，做 App、写字、录播客。',
  author: 'norvyn',
  email: 'norvyn@norvyn.com',
  github: 'https://github.com/n0rvyn',
};

// WordPress import placeholders that predate this feature — treat as "unset"
// so the resolved value falls back to DEFAULTS rather than leaking
// "Wordbase Blog" / "A personal blog" into nav, title, RSS, llms.txt.
const LEGACY = new Set(['Wordbase Blog', 'A personal blog']);

const pick = (v: string | undefined, def: string): string => {
  const trimmed = v?.trim();
  return trimmed && !LEGACY.has(trimmed) ? trimmed : def;
};

// Single source of truth for which settings keys back which SiteIdentity
// field. getSiteIdentity (read) and the MCP settings_update_site tool (write,
// packages/api/src/mcp/tools.ts) both key off this map so the two stay
// symmetric — a key that isn't in here is neither read nor writable as site
// identity.
export const SITE_IDENTITY_SETTINGS_KEYS: Record<keyof SiteIdentity, string> = {
  name: 'site.title',
  description: 'site.description',
  author: 'site.author',
  email: 'site.email',
  github: 'social.github',
};

export async function getSiteIdentity(): Promise<SiteIdentity> {
  const s = await getSettings();
  return {
    name: pick(s[SITE_IDENTITY_SETTINGS_KEYS.name], DEFAULTS.name),
    description: pick(s[SITE_IDENTITY_SETTINGS_KEYS.description], DEFAULTS.description),
    author: pick(s[SITE_IDENTITY_SETTINGS_KEYS.author], DEFAULTS.author),
    email: pick(s[SITE_IDENTITY_SETTINGS_KEYS.email], DEFAULTS.email),
    github: pick(s[SITE_IDENTITY_SETTINGS_KEYS.github], DEFAULTS.github),
  };
}
