// Build-time localization helpers. Take an entity from lib/api and produce a
// localized copy by calling /api/i18n/render for each translatable field.
// lang === 'zh' short-circuits — the source row IS the Chinese (and the API
// would return the same thing), so the build skips the network roundtrip.
//
// All helpers are tolerant: on any getRendition failure (API down, no cache
// row, 404) the field falls back to the source. Build must never abort
// because of a missing translation.
//
// Why one helper per entity type? The fields differ:
//   post: title, content
//   page: title, content
//   app:  tagline, features (features is a JSON-encoded array of {icon,title,blurb} —
//          the render endpoint returns the localized JSON as a string, so we
//          parse it back and merge only the localized strings; icons stay
//          untouched).

import { getRendition, type Post, type Page, type App } from './api';

type LocalizedPost = Post;
type LocalizedPage = Page;
type LocalizedApp = App;

export async function localizePost(post: Post, lang: string): Promise<LocalizedPost> {
  if (lang === 'zh' || !lang) return post;
  const [enTitle, enContent] = await Promise.all([
    getRendition('post', post.id, 'title', lang),
    getRendition('post', post.id, 'content', lang),
  ]);
  return {
    ...post,
    title: enTitle ?? post.title,
    content: enContent ?? post.content,
  };
}

export async function localizePage(page: Page, lang: string): Promise<LocalizedPage> {
  if (lang === 'zh' || !lang) return page;
  const [enTitle, enContent] = await Promise.all([
    getRendition('page', page.id, 'title', lang),
    getRendition('page', page.id, 'content', lang),
  ]);
  return {
    ...page,
    title: enTitle ?? page.title,
    content: enContent ?? page.content,
  };
}

interface AppFeature { icon?: string; title: string; blurb: string }

export async function localizeApp(app: App, lang: string): Promise<LocalizedApp> {
  if (lang === 'zh' || !lang) return app;
  const [enTagline, enFeaturesRaw] = await Promise.all([
    getRendition('app', app.id, 'tagline', lang),
    getRendition('app', app.id, 'features', lang),
  ]);

  let features = app.features;
  if (enFeaturesRaw) {
    // renderEntityField returns a JSON-encoded string of the localized
    // features array. Validate shape; if anything is off, keep the source
    // features (build must not break on a malformed cache row).
    try {
      const parsed = JSON.parse(enFeaturesRaw);
      if (Array.isArray(parsed)) {
        const merged: AppFeature[] = (Array.isArray(app.features) ? app.features : (app.features ? JSON.parse(app.features) : []) as AppFeature[])
          .map((f) => ({ icon: f.icon, title: f.title, blurb: f.blurb }));
        // The render endpoint preserves order and shape; we just keep the
        // localized strings it produced.
        for (let i = 0; i < parsed.length && i < merged.length; i++) {
          const p = parsed[i] as Partial<AppFeature>;
          if (typeof p.title === 'string') merged[i].title = p.title;
          if (typeof p.blurb === 'string') merged[i].blurb = p.blurb;
        }
        features = JSON.stringify(merged);
      }
    } catch {
      // bad JSON in the cache row — keep the source
    }
  }

  return {
    ...app,
    tagline: enTagline ?? app.tagline,
    features,
  };
}
