import type { APIRoute, GetStaticPaths } from 'astro';
import { getPosts } from '../../lib/api';
import type { Post } from '../../lib/api';
import { renderPostOgImageCached, fmtDateUTC } from '../../lib/og-image';

// One static PNG per published post: /og/<slug>.png — the Chinese-title card.
export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await getPosts({ status: 'published', limit: 10000 });
  return data.map((post) => ({ params: { slug: post.slug }, props: { post } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: Post };
  const png = await renderPostOgImageCached({
    title: post.title,
    dateLabel: fmtDateUTC(post.publishedAt ?? post.createdAt),
  });
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
};
