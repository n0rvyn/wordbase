import type { APIRoute } from 'astro';
import { getPosts, getCategories, getTags, getPages, type Post, type Category, type Tag, type Page } from '../lib/api';

export const GET: APIRoute = async () => {
  const site = 'https://blog.norvyn.com';

  const [postsRes, categories, tags, pages] = await Promise.all([
    getPosts({ status: 'published', limit: 10000 }),
    getCategories(),
    getTags(),
    getPages(),
  ]);

  const posts = postsRes.data;

  const urls: { loc: string; lastmod?: string; priority: string }[] = [];

  // Homepage
  urls.push({ loc: `${site}/`, priority: '1.0' });

  // Posts
  posts.forEach((post: Post) => {
    const lastmod = post.updatedAt
      ? new Date(post.updatedAt * 1000).toISOString().split('T')[0]
      : undefined;
    urls.push({ loc: `${site}/posts/${post.slug}`, lastmod, priority: '0.8' });
  });

  // Categories
  urls.push({ loc: `${site}/categories`, priority: '0.5' });
  categories.forEach((cat: Category) => {
    urls.push({ loc: `${site}/categories/${cat.slug}`, priority: '0.5' });
  });

  // Tags
  urls.push({ loc: `${site}/tags`, priority: '0.4' });
  tags.forEach((tag: Tag) => {
    urls.push({ loc: `${site}/tags/${tag.slug}`, priority: '0.3' });
  });

  // Pages
  pages
    .filter((p: Page) => p.status === 'published')
    .forEach((page: Page) => {
      urls.push({ loc: `${site}/${page.slug}`, priority: '0.6' });
    });

  // Archives
  urls.push({ loc: `${site}/archives`, priority: '0.4' });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
