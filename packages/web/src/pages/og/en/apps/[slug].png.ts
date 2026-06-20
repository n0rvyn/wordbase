import type { APIRoute, GetStaticPaths } from 'astro';
import { getApps } from '../../../../lib/api';
import type { App } from '../../../../lib/api';
import { localizeApp } from '../../../../lib/localize';
import { renderAppOgImageCached } from '../../../../lib/og-image';

// One static PNG per published app: /og/en/apps/<slug>.png — the English card.
// Tagline comes from localizeApp (same source en/apps/[slug].astro uses); the
// name stays Chinese (ASC-owned), matching the page <title>.
export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await getApps({ status: 'published', limit: 10000 });
  return data.map((app) => ({ params: { slug: app.slug }, props: { app } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { app } = props as { app: App };
  const localized = await localizeApp(app, 'en');
  const png = await renderAppOgImageCached({
    name: localized.name,
    tagline: localized.tagline || localized.subtitle || '',
    iconUrl: localized.icon,
    accentColor: localized.accentColor,
  });
  // @types/node made Buffer generic (Buffer<ArrayBufferLike>), which no longer
  // satisfies BodyInit; copy into a Uint8Array<ArrayBuffer> (the assignable form).
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
};
