import type { APIRoute, GetStaticPaths } from 'astro';
import { getPosts } from '../../lib/api';
import type { Post } from '../../lib/api';

export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await getPosts({ status: 'published', limit: 10000 });
  return data.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { post } = props as { post: Post };
  // Minimal front-matter (title only) + raw Markdown body, no transformation.
  // AI / answer engines prefer the raw text over stripped HTML.
  const body = `---\ntitle: ${post.title}\n---\n\n${post.content}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
