import type { EnStoreCopy } from './appstore-lookup.service.js';

/**
 * Merge the English storefront's copy into an app's `meta` JSON under
 * `i18n.en`, leaving every other key alone.
 *
 * `meta` is an editorial free-form column that `app_update` can also write, so
 * this merges rather than replaces. A null `en` REMOVES the key: the app is no
 * longer listed on the English storefront, and keeping the last copy we saw
 * would have /en quoting a listing that no longer exists.
 *
 * Unparseable existing meta is treated as absent rather than thrown on — a bad
 * hand-edited row must not be able to break every sync that follows.
 */
export function mergeEnCopyIntoMeta(currentMeta: string | null, en: EnStoreCopy | null): string | null {
  let base: Record<string, unknown> = {};
  if (currentMeta) {
    try {
      const parsed = JSON.parse(currentMeta);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // keep {}
    }
  }

  const i18nRaw = base.i18n;
  const i18n: Record<string, unknown> =
    i18nRaw && typeof i18nRaw === 'object' && !Array.isArray(i18nRaw)
      ? { ...(i18nRaw as Record<string, unknown>) }
      : {};

  if (en) i18n.en = en;
  else delete i18n.en;

  const next = { ...base };
  if (Object.keys(i18n).length > 0) next.i18n = i18n;
  else delete next.i18n;

  // An empty object is stored as null so `meta` stays null on apps that never
  // had one — otherwise every sync would report `meta` as a changed field.
  return Object.keys(next).length > 0 ? JSON.stringify(next) : null;
}
