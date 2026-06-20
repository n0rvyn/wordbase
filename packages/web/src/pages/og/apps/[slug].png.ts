import type { APIRoute, GetStaticPaths } from 'astro';
import { getApps } from '../../../lib/api';
import type { App } from '../../../lib/api';
import { renderAppOgImageCached } from '../../../lib/og-image';

// One static PNG per published app: /og/apps/<slug>.png — the dark landscape
// social card (icon + name + tagline). Mirrors /og/<slug>.png for posts.
export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await getApps({ status: 'published', limit: 10000 });
  return data.map((app) => ({ params: { slug: app.slug }, props: { app } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { app } = props as { app: App };
  const png = await renderAppOgImageCached({
    name: app.name,
    tagline: app.tagline || app.subtitle || '',
    iconUrl: app.icon,
    accentColor: app.accentColor,
  });
  // @types/node made Buffer generic (Buffer<ArrayBufferLike>), which no longer
  // satisfies BodyInit; copy into a Uint8Array<ArrayBuffer> (the assignable form).
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
};
