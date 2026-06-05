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

export async function getSiteIdentity(): Promise<SiteIdentity> {
  const s = await getSettings();
  return {
    name: pick(s['site.title'], DEFAULTS.name),
    description: pick(s['site.description'], DEFAULTS.description),
    author: pick(s['site.author'], DEFAULTS.author),
    email: pick(s['site.email'], DEFAULTS.email),
    github: pick(s['social.github'], DEFAULTS.github),
  };
}
