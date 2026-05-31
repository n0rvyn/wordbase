/**
 * App Store Connect (ASC) Service
 * Fetches managed App metadata via the ASC API using ES256 JWT authentication.
 *
 * Credentials are read exclusively from environment variables — never logged, never stored in DB.
 * Prefer ASC_PRIVATE_KEY_PATH (path to .p8 file) over ASC_PRIVATE_KEY (inline PEM) to avoid
 * shell escaping issues with embedded newlines.
 */

import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8, decodeProtectedHeader } from 'jose';

export interface AscAppMeta {
  category: string | null;
  version: string | null;
  subtitle: string | null;
  whatsNew: string | null;
  description: string | null;
  screenshots: string[];
}

// Token cache
let cachedToken: string | null = null;
let cachedTokenExp: number = 0;

function getCredentials(): { keyId: string; issuerId: string; privateKeyPem: string } | null {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  let pem = process.env.ASC_PRIVATE_KEY;

  if (!keyId || !issuerId) return null;

  if (!pem) {
    const keyPath = process.env.ASC_PRIVATE_KEY_PATH;
    if (!keyPath) return null;
    try {
      pem = readFileSync(keyPath, 'utf-8');
    } catch {
      return null;
    }
  }

  // Normalize literal \n sequences (common when setting PEM via env var)
  pem = pem.replace(/\\n/g, '\n');

  return { keyId, issuerId, privateKeyPem: pem };
}

export function isAscConfigured(): boolean {
  return getCredentials() !== null;
}

export async function getAscToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedTokenExp > now + 60) {
    return cachedToken;
  }

  const creds = getCredentials();
  if (!creds) {
    throw new Error('ASC_NOT_CONFIGURED');
  }

  const { keyId, issuerId, privateKeyPem } = creds;
  const key = await importPKCS8(privateKeyPem, 'ES256');

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setExpirationTime('19m')
    .sign(key);

  // Parse exp from the generated token to cache it correctly
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { exp: number };
  cachedToken = token;
  cachedTokenExp = payload.exp;

  return token;
}

const ASC_BASE = 'https://api.appstoreconnect.apple.com';

async function ascFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${ASC_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`ASC request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

interface AscAppInfosResponse {
  data: Array<{
    id: string;
    type: string;
    attributes?: { appStoreState?: string; state?: string };
    relationships?: Record<string, { data: { id: string; type: string } | Array<{ id: string; type: string }> }>;
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
}

interface AscAppInfoLocalizationsResponse {
  data: Array<{
    id: string;
    type: string;
    attributes?: { locale?: string; subtitle?: string | null };
  }>;
}

interface AscVersionsResponse {
  data: Array<{
    id: string;
    type: string;
    attributes?: { versionString?: string };
    relationships?: Record<string, { data: Array<{ id: string; type: string }> }>;
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
}

interface AscScreenshotSetsResponse {
  data: Array<{
    id: string;
    type: string;
    relationships?: Record<string, { data: Array<{ id: string; type: string }> }>;
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * Resolve an ASC templateUrl by substituting {w}, {h}, {f} placeholders.
 * Per DP-3.5-1: width=1290, height=2796 (iPhone 6.9" portrait), format=png.
 */
function resolveTemplateUrl(tpl: string, w: number, h: number, f: string): string {
  return tpl.replace('{w}', String(w)).replace('{h}', String(h)).replace('{f}', f);
}

export interface AscAppEntry {
  appStoreId: string;
  name: string;
  bundleId: string | null;
}

interface AscAppsListResponse {
  data: Array<{
    id: string;
    attributes?: { name?: string; bundleId?: string };
  }>;
}

/**
 * List all apps in the ASC account.
 * Returns up to 200 apps (single page). If data.length === 200, pagination may be needed
 * (the account likely has more apps) — a warning is emitted.
 * TODO: add cursor-based pagination when account exceeds 200 apps.
 * Throws ASC_NOT_CONFIGURED if credentials are absent.
 */
export async function listAscApps(): Promise<AscAppEntry[]> {
  if (!isAscConfigured()) {
    throw new Error('ASC_NOT_CONFIGURED');
  }

  const token = await getAscToken();
  const data = await ascFetch<AscAppsListResponse>('/v1/apps?limit=200', token);

  if (data.data.length === 200) {
    console.warn(
      '[asc] listAscApps: data.length === 200 — possible pagination truncation. ' +
      'TODO: add cursor-based pagination.'
    );
  }

  return data.data.map(d => ({
    appStoreId: d.id,
    // name falls back to d.id (never null) — CreateAppData.name is non-nullable (schema NOT NULL).
    name: d.attributes?.name ?? d.id,
    bundleId: d.attributes?.bundleId ?? null,
  }));
}

export async function fetchAppMetadata(appStoreId: string): Promise<AscAppMeta | null> {
  if (!isAscConfigured()) {
    throw new Error('ASC_NOT_CONFIGURED');
  }

  const token = await getAscToken();

  // Step 1a: GET /v1/apps/:id/appInfos?include=primaryCategory
  // Returns array of appInfos (may have multiple review states).
  // Prefer the one with state in {READY_FOR_SALE, APPROVED, PENDING_APPLE_RELEASE};
  // otherwise fall back to first entry.
  const appInfosData = await ascFetch<AscAppInfosResponse>(
    `/v1/apps/${appStoreId}/appInfos?include=primaryCategory`,
    token
  );

  const preferredStates = new Set(['READY_FOR_SALE', 'APPROVED', 'PENDING_APPLE_RELEASE']);
  const appInfoList = appInfosData.data ?? [];
  const chosenAppInfo =
    appInfoList.find(
      i =>
        preferredStates.has(i.attributes?.appStoreState ?? '') ||
        preferredStates.has(i.attributes?.state ?? '')
    ) ?? appInfoList[0];

  let category: string | null = null;

  if (chosenAppInfo) {
    // Get category display name from included appCategories resource.
    // Real API: category id is an uppercase token (e.g. PRODUCTIVITY) with NO attributes.name.
    // Per DP-3.5-2: use attributes.name ONLY if present; if absent leave category=null.
    // iTunes supplies the clean display string via merge — do NOT substitute the id token.
    const catRel = chosenAppInfo.relationships?.primaryCategory?.data;
    if (catRel && !Array.isArray(catRel)) {
      const catId = (catRel as { id: string }).id;
      const catResource = (appInfosData.included ?? []).find(i => i.id === catId);
      if (catResource?.attributes?.name && typeof catResource.attributes.name === 'string') {
        category = catResource.attributes.name;
      }
      // If attributes.name absent → category stays null (expected for real appCategories tokens)
    }
  }

  // Step 1b: GET /v1/appInfos/:infoId/appInfoLocalizations
  // Prefer locale==='zh-Hans'; else first entry with a non-empty subtitle.
  let subtitle: string | null = null;

  if (chosenAppInfo) {
    const infoId = chosenAppInfo.id;
    const locData = await ascFetch<AscAppInfoLocalizationsResponse>(
      `/v1/appInfos/${infoId}/appInfoLocalizations`,
      token
    );
    const locs = locData.data ?? [];
    const zhLoc = locs.find(l => l.attributes?.locale === 'zh-Hans');
    if (zhLoc?.attributes?.subtitle) {
      subtitle = zhLoc.attributes.subtitle;
    } else {
      for (const loc of locs) {
        if (loc.attributes?.subtitle) {
          subtitle = loc.attributes.subtitle;
          break;
        }
      }
    }
  }

  // Step 2: Fetch latest appStoreVersion + localizations (unchanged — API-valid)
  // Deterministically select verLocId: prefer zh-Hans, else first.
  // This id is reused in Task 2 for screenshots (MR-1 determinism).
  const versionsData = await ascFetch<AscVersionsResponse>(
    `/v1/apps/${appStoreId}/appStoreVersions?limit=1&include=appStoreVersionLocalizations`,
    token
  );

  let version: string | null = null;
  let whatsNew: string | null = null;
  let description: string | null = null;
  let verLocId: string | null = null;

  const versionList = versionsData.data ?? [];
  if (versionList.length > 0) {
    const ver = versionList[0];
    version = ver.attributes?.versionString ?? null;

    const verIncluded = versionsData.included ?? [];
    const verLocIds = ver.relationships?.appStoreVersionLocalizations?.data?.map(d => d.id) ?? [];

    // Deterministic selection: prefer zh-Hans, else first with attributes
    const zhVerLoc = verLocIds
      .map(id => verIncluded.find(i => i.id === id && i.type === 'appStoreVersionLocalizations'))
      .find(loc => loc?.attributes && (loc.attributes.locale as string | undefined) === 'zh-Hans');

    const firstVerLoc = verLocIds
      .map(id => verIncluded.find(i => i.id === id && i.type === 'appStoreVersionLocalizations'))
      .find(loc => loc?.attributes);

    const chosenVerLoc = zhVerLoc ?? firstVerLoc;

    if (chosenVerLoc) {
      verLocId = chosenVerLoc.id;
      if (typeof chosenVerLoc.attributes!.whatsNew === 'string') whatsNew = chosenVerLoc.attributes!.whatsNew as string;
      if (typeof chosenVerLoc.attributes!.description === 'string') description = chosenVerLoc.attributes!.description as string;
    }
  }

  // Step 3: Fetch ASC screenshots for the deterministic verLocId (Task 2)
  // Uses verLocId from above (zh-Hans-first, else first) — never break-order non-determinism.
  // Per DP-3.5-1: resolve templateUrl to 1290×2796 png.
  let screenshots: string[] = [];

  if (verLocId) {
    try {
      const screenshotSetsData = await ascFetch<AscScreenshotSetsResponse>(
        `/v1/appStoreVersionLocalizations/${verLocId}/appScreenshotSets?include=appScreenshots`,
        token
      );

      const screenshotIncluded = screenshotSetsData.included ?? [];
      for (const resource of screenshotIncluded) {
        if (resource.type === 'appScreenshots') {
          const tpl = (resource.attributes as { imageAsset?: { templateUrl?: string } } | undefined)
            ?.imageAsset?.templateUrl;
          if (tpl) {
            screenshots.push(resolveTemplateUrl(tpl, 1290, 2796, 'png'));
          }
        }
      }
    } catch {
      // Screenshot fetch failure must not abort the full metadata fetch (Task 2 step 5).
      // Falls through with screenshots=[] which Task 3 merge harden handles correctly.
      screenshots = [];
    }
  }

  return {
    category,
    version,
    subtitle,
    whatsNew,
    description,
    screenshots,
  };
}
