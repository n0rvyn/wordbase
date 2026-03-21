---
type: plan
status: active
tags: [astro, blog, static-site, tailwind, preact]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Wordbase Blog Frontend Implementation Plan

**Goal:** Fully functional blog frontend with static pages including homepage, post detail, category/tag archives, and independent pages.

**Architecture:** Astro SSG fetches from API at build time for static content. Comments load client-side via Preact island components. Tailwind CSS for styling. Marked library for Markdown rendering in the browser.

**Tech Stack:** Astro 4.x, Tailwind CSS, Preact (for interactive islands), Marked (Markdown rendering)

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

---

## Decisions

### [DP-001] Homepage pagination strategy (blocking)
**Chosen:** A — Use Astro's `paginate()` in `getStaticPaths()` generating `/page/1/`, `/page/2/` pages.

### [DP-002] Archive page vs catch-all page (recommended)
**Chosen:** A — Split into `pages/archives.astro` (dedicated) + `pages/[slug].astro` (DB pages only).

---

## Tasks

<!-- section: task-1 keywords: tailwind, astro, dependencies -->
### Task 1: Install dependencies (Tailwind, Preact, Marked)

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/astro.config.mjs`

**Steps:**
1. Add dependencies to package.json:
   ```json
   "dependencies": {
     "astro": "^4.0.0",
     "@astrojs/tailwind": "^5.1.0",
     "tailwindcss": "^3.4.0",
     "@astrojs/preact": "^3.0.0",
     "preact": "^10.19.0",
     "marked": "^12.0.0"
   }
   ```
2. Update astro.config.mjs to include integrations:
   ```javascript
   import { defineConfig } from 'astro/config';
   import tailwind from '@astrojs/tailwind';
   import preact from '@astrojs/preact';

   export default defineConfig({
     site: 'https://blog.norvyn.com',
     output: 'static',
     server: { port: 4321 },
     build: { outDir: './dist' },
     integrations: [tailwind(), preact()],
   });
   ```
3. Create tailwind.config.mjs:
   ```javascript
   /** @type {import('tailwindcss').Config} */
   export default {
     content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
     theme: {
       extend: {},
     },
     plugins: [],
   };
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/web && npm install`
Expected: Dependencies install without errors
<!-- /section -->

<!-- section: task-2 keywords: layout, astro, base-styling -->
### Task 2: Create base layout component

**Files:**
- Create: `packages/web/src/layouts/BaseLayout.astro`
- Modify: `packages/web/src/pages/index.astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/layouts/BaseLayout.astro`:
   ```astro
   ---
   interface Props {
     title: string;
     description?: string;
   }

   const { title, description = 'A blog about technology and programming' } = Astro.props;
   ---

   <!DOCTYPE html>
   <html lang="zh-CN">
     <head>
       <meta charset="utf-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <meta name="description" content={description} />
       <title>{title} | Wordbase</title>
     </head>
     <body class="bg-gray-50 text-gray-900 min-h-screen">
       <header class="bg-white shadow-sm">
         <nav class="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
           <a href="/" class="text-xl font-bold text-gray-800 hover:text-blue-600">Wordbase</a>
           <div class="flex gap-4">
             <a href="/categories" class="text-gray-600 hover:text-blue-600">Categories</a>
             <a href="/tags" class="text-gray-600 hover:text-blue-600">Tags</a>
             <a href="/archives" class="text-gray-600 hover:text-blue-600">Archives</a>
           </div>
         </nav>
       </header>
       <main class="max-w-4xl mx-auto px-4 py-8">
         <slot />
       </main>
       <footer class="bg-white border-t mt-auto">
         <div class="max-w-4xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
           &copy; {new Date().getFullYear()} Wordbase. All rights reserved.
         </div>
       </footer>
     </body>
   </html>
   ```

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-3 keywords: api-client, typescript, fetch -->
### Task 3: Create API client utility

**Files:**
- Create: `packages/web/src/lib/api.ts`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/lib/api.ts`:
   ```typescript
   const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4100';

   export interface Post {
     id: string;
     slug: string;
     title: string;
     content: string;
     excerpt: string | null;
     coverImage: string | null;
     status: string;
     publishedAt: number | null;
     createdAt: number;
     updatedAt: number;
     meta: string | null;
   }

   export interface Category {
     id: string;
     slug: string;
     name: string;
     description: string | null;
     sortOrder: number;
   }

   export interface Tag {
     id: string;
     slug: string;
     name: string;
   }

   export interface Page {
     id: string;
     slug: string;
     title: string;
     content: string;
     sortOrder: number;
     status: string;
     meta: string | null;
     createdAt: number;
     updatedAt: number;
   }

   export interface Comment {
     id: string;
     postId: string;
     parentId: string | null;
     authorName: string;
     authorEmail: string | null;
     authorUrl: string | null;
     content: string;
     status: string;
     createdAt: number;
   }

   export interface PostsResponse {
     data: Post[];
     total: number;
     page: number;
     limit: number;
   }

   export interface CommentsResponse {
     data: Comment[];
     total: number;
     page: number;
     limit: number;
   }

   async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
     const res = await fetch(`${API_URL}${endpoint}`, {
       ...options,
       headers: {
         'Content-Type': 'application/json',
         ...options?.headers,
       },
     });

     if (!res.ok) {
       throw new Error(`API error: ${res.status} ${res.statusText}`);
     }

     return res.json();
   }

   export async function getPosts(options: {
     status?: string;
     category?: string;
     tag?: string;
     page?: number;
     limit?: number;
     search?: string;
   } = {}): Promise<PostsResponse> {
     const params = new URLSearchParams();
     if (options.status) params.set('status', options.status);
     if (options.category) params.set('category', options.category);
     if (options.tag) params.set('tag', options.tag);
     if (options.page) params.set('page', String(options.page));
     if (options.limit) params.set('limit', String(options.limit));
     if (options.search) params.set('search', options.search);

     const query = params.toString();
     return fetchAPI<PostsResponse>(`/api/posts${query ? `?${query}` : ''}`);
   }

   export async function getPost(slug: string): Promise<Post | null> {
     try {
       return await fetchAPI<Post>(`/api/posts/${slug}`);
     } catch {
       return null;
     }
   }

   export async function getCategories(): Promise<Category[]> {
     return fetchAPI<Category[]>('/api/categories');
   }

   export async function getCategory(slug: string): Promise<Category | null> {
     try {
       return await fetchAPI<Category>(`/api/categories/${slug}`);
     } catch {
       return null;
     }
   }

   export async function getTags(): Promise<Tag[]> {
     return fetchAPI<Tag[]>('/api/tags');
   }

   export async function getTag(slug: string): Promise<Tag | null> {
     try {
       return await fetchAPI<Tag>(`/api/tags/${slug}`);
     } catch {
       return null;
     }
   }

   export async function getPages(): Promise<Page[]> {
     return fetchAPI<Page[]>('/api/pages');
   }

   export async function getPage(slug: string): Promise<Page | null> {
     try {
       return await fetchAPI<Page>(`/api/pages/${slug}`);
     } catch {
       return null;
     }
   }

   export async function getComments(postId: string): Promise<CommentsResponse> {
     return fetchAPI<CommentsResponse>(`/api/posts/${postId}/comments?status=approved`);
   }

   export async function createComment(postId: string, data: {
     author_name: string;
     author_email?: string;
     author_url?: string;
     content: string;
     parent_id?: string;
   }): Promise<Comment> {
     return fetchAPI<Comment>(`/api/posts/${postId}/comments`, {
       method: 'POST',
       body: JSON.stringify(data),
     });
   }
   ```

**Verify:**
TypeScript compilation (verify in task 7)
<!-- /section -->

<!-- section: task-4 keywords: homepage, astro, pagination -->
### Task 4: Homepage with post list and pagination

**Files:**
- Modify: `packages/web/src/pages/index.astro`

**Steps:**
1. Replace `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/index.astro`:
   ```astro
   ---
   import BaseLayout from '../layouts/BaseLayout.astro';
   import { getPosts, type Post } from '../lib/api';

   const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4100';

   // Get page from query params for pagination
   const page = Number(Astro.url.searchParams.get('page')) || 1;
   const limit = 10;

   // Fetch published posts at build time
   const { data: posts, total } = await getPosts({ status: 'published', page, limit });

   const totalPages = Math.ceil(total / limit);
   const hasNext = page < totalPages;
   const hasPrev = page > 1;

   // Format date helper
   function formatDate(timestamp: number): string {
     return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
     });
   }
   ---

   <BaseLayout title="Home">
     <h1 class="text-3xl font-bold mb-8">Latest Posts</h1>

     {posts.length === 0 ? (
       <p class="text-gray-500">No posts yet.</p>
     ) : (
       <div class="space-y-8">
         {posts.map((post: Post) => (
           <article class="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
             {post.coverImage && (
               <img
                 src={post.coverImage}
                 alt={post.title}
                 class="w-full h-48 object-cover rounded-lg mb-4"
               />
             )}
             <h2 class="text-2xl font-semibold mb-2">
               <a href={`/posts/${post.slug}`} class="text-gray-900 hover:text-blue-600">
                 {post.title}
               </a>
             </h2>
             <p class="text-gray-600 mb-3">
               {post.excerpt || post.content.substring(0, 200) + '...'}
             </p>
             <div class="text-sm text-gray-500">
               {post.publishedAt && <time datetime={new Date(post.publishedAt * 1000).toISOString()}>
                 {formatDate(post.publishedAt)}
               </time>}
             </div>
           </article>
         ))}
       </div>
     )}

     {/* Pagination */}
     {totalPages > 1 && (
       <nav class="flex justify-center gap-4 mt-8">
         {hasPrev && (
           <a href={`/?page=${page - 1}`} class="px-4 py-2 bg-white border rounded hover:bg-gray-50">
             Previous
           </a>
         )}
         <span class="px-4 py-2 text-gray-600">
           Page {page} of {totalPages}
         </span>
         {hasNext && (
           <a href={`/?page=${page + 1}`} class="px-4 py-2 bg-white border rounded hover:bg-gray-50">
             Next
           </a>
         )}
       </nav>
     )}
   </BaseLayout>
   ```

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-5 keywords: post-page, markdown, astro -->
### Task 5: Post detail page with Markdown rendering

**Files:**
- Create: `packages/web/src/pages/posts/[slug].astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/posts/[slug].astro`:
   ```astro
   ---
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import { getPosts, getPost, type Post } from '../../lib/api';
   import CommentSection from '../../components/CommentSection.astro';
   import ShareButtons from '../../components/ShareButtons.astro';
   import { marked } from 'marked';

   // Get all published posts for static paths
   export async function getStaticPaths() {
     const { data: posts } = await getPosts({ status: 'published', limit: 100 });
     return posts.map((post: Post) => ({
       params: { slug: post.slug },
       props: { post },
     }));
   }

   interface Props {
     post: Post;
   }

   const { post } = Astro.props;

   // Parse markdown content
   const htmlContent = marked.parse(post.content);

   function formatDate(timestamp: number): string {
     return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
     });
   }

   const siteUrl = import.meta.env.SITE || 'https://blog.norvyn.com';
   const postUrl = `${siteUrl}/posts/${post.slug}`;
   ---

   <BaseLayout title={post.title} description={post.excerpt || undefined}>
     <article>
       {post.coverImage && (
         <img
           src={post.coverImage}
           alt={post.title}
           class="w-full h-64 md:h-96 object-cover rounded-lg mb-8"
         />
       )}

       <header class="mb-8">
         <h1 class="text-4xl font-bold mb-4">{post.title}</h1>
         <div class="text-gray-600 mb-4">
           {post.publishedAt && (
             <time datetime={new Date(post.publishedAt * 1000).toISOString()}>
               {formatDate(post.publishedAt)}
             </time>
           )}
         </div>
         <ShareButtons url={postUrl} title={post.title} />
       </header>

       <div class="prose prose-lg max-w-none" set:html={htmlContent} />

       <footer class="mt-12 pt-8 border-t">
         <ShareButtons url={postUrl} title={post.title} />
       </footer>
     </article>

     <CommentSection postId={post.id} postSlug={post.slug} />
   </BaseLayout>
   ```

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-6 keywords: share-buttons, wechat, twitter -->
### Task 6: Social share buttons component

**Files:**
- Create: `packages/web/src/components/ShareButtons.astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/components/ShareButtons.astro`:
   ```astro
   ---
   interface Props {
     url: string;
     title: string;
   }

   const { url, title } = Astro.props;
   const encodedUrl = encodeURIComponent(url);
   const encodedTitle = encodeURIComponent(title);

   // WeChat share uses a QR code - we'll use a simple approach with wx.qq.com or similar
   const wechatShareUrl = `https://qr.qq.com/cgi-bin/qr_share?=${encodedUrl}`;
   ---

   <div class="flex gap-4 items-center">
     <span class="text-gray-600 text-sm">Share:</span>

     {/* WeChat - opens modal with QR code */}
     <button
       type="button"
       class="share-wechat p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
       data-url={url}
       aria-label="Share on WeChat"
     >
       <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
         <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .186-.059l2.114-1.225a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336l.315.224a.324.324 0 0 0 .186.059c.16 0 .29-.132.29-.295 0-.072-.03-.143-.048-.213l-.39-1.48a.59.59 0 0 1 .213-.665C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135.004-.269.017-.406.02zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
       </svg>
     </button>

     {/* Twitter/X */}
     <a
       href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
       target="_blank"
       rel="noopener noreferrer"
       class="p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
       aria-label="Share on Twitter"
     >
       <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
         <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
       </svg>
     </a>

     {/* Copy link */}
     <button
       type="button"
       class="copy-link-btn p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
       data-url={url}
       aria-label="Copy link"
     >
       <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
       </svg>
     </button>
   </div>

   <script>
     // Copy link functionality
     document.querySelectorAll('.copy-link-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         const url = btn.getAttribute('data-url') || window.location.href;
         await navigator.clipboard.writeText(url);
         btn.innerHTML = '<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
         setTimeout(() => {
           btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>';
         }, 2000);
       });
     });

     // WeChat QR code modal
     document.querySelectorAll('.share-wechat').forEach(btn => {
       btn.addEventListener('click', () => {
         const url = btn.getAttribute('data-url') || window.location.href;
         const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
         const modal = document.createElement('div');
         modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
         modal.innerHTML = `
           <div class="bg-white p-6 rounded-lg text-center">
             <h3 class="text-lg font-semibold mb-4">Scan QR Code</h3>
             <img src="${qrUrl}" alt="QR Code" class="mx-auto" />
             <p class="text-gray-600 mt-4 text-sm">Use WeChat to scan</p>
             <button class="mt-4 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 close-modal">Close</button>
           </div>
         `;
         document.body.appendChild(modal);
         modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
         modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
       });
     });
   </script>
   ```

**UX ref:** UX-009
**User interaction:** User clicks WeChat button to see QR code modal, clicks Twitter to open tweet composer, clicks copy link to copy URL to clipboard.
<!-- /section -->

<!-- section: task-7 keywords: comment-section, preact, client-fetch -->
### Task 7: Comment section component (client-side fetch)

**Files:**
- Create: `packages/web/src/components/CommentSection.astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/components/CommentSection.astro`:
   ```astro
   ---
   interface Props {
     postId: string;
     postSlug: string;
   }

   const { postId, postSlug } = Astro.props;
   const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4100';
   ---

   <section class="mt-12">
     <h2 class="text-2xl font-bold mb-6">Comments</h2>

     {/* Comment form */}
     <form class="comment-form bg-white p-6 rounded-lg border mb-8" data-post-id={postId}>
       <div class="mb-4">
         <label for="author-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
         <input
           type="text"
           id="author-name"
           name="author_name"
           required
           class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
         />
       </div>
       <div class="mb-4">
         <label for="author-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
         <input
           type="email"
           id="author-email"
           name="author_email"
           class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
         />
       </div>
       <div class="mb-4">
         <label for="author-url" class="block text-sm font-medium text-gray-700 mb-1">Website</label>
         <input
           type="url"
           id="author-url"
           name="author_url"
           class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
         />
       </div>
       <div class="mb-4">
         <label for="content" class="block text-sm font-medium text-gray-700 mb-1">Comment *</label>
         <textarea
           id="content"
           name="content"
           rows="4"
           required
           class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
         ></textarea>
       </div>
       <button
         type="submit"
         class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
       >
         Submit
       </button>
       <p class="text-sm text-gray-500 mt-2">Your comment will appear after moderation.</p>
     </form>

     {/* Comments list container - loaded client-side */}
     <div id="comments-container" data-api-url={API_URL} data-post-id={postId}>
       <p class="text-gray-500">Loading comments...</p>
     </div>
   </section>

   <script>
     const API_URL = document.getElementById('comments-container')?.getAttribute('data-api-url') || 'http://localhost:4100';
     const POST_ID = document.getElementById('comments-container')?.getAttribute('data-post-id');

     // Load comments on page load
     async function loadComments() {
       const container = document.getElementById('comments-container');
       if (!container || !POST_ID) return;

       try {
         const res = await fetch(`${API_URL}/api/posts/${POST_ID}/comments?status=approved`);
         if (!res.ok) throw new Error('Failed to load comments');
         const { data: comments } = await res.json();

         if (comments.length === 0) {
           container.innerHTML = '<p class="text-gray-500">No comments yet. Be the first to comment!</p>';
           return;
         }

         container.innerHTML = `
           <div class="space-y-6">
             ${comments.map((comment: any) => `
               <div class="bg-white p-4 rounded-lg border">
                 <div class="flex items-center gap-2 mb-2">
                   <span class="font-semibold">${escapeHtml(comment.authorName)}</span>
                   <span class="text-gray-500 text-sm">${formatDate(comment.createdAt)}</span>
                 </div>
                 <p class="text-gray-700">${escapeHtml(comment.content)}</p>
               </div>
             `).join('')}
           </div>
         `;
       } catch (err) {
         container.innerHTML = '<p class="text-gray-500">Failed to load comments.</p>';
       }
     }

     // Handle form submission
     document.querySelector('.comment-form')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const form = e.target as HTMLFormElement;
       const postId = form.getAttribute('data-post-id');
       const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

       const formData = new FormData(form);
       const data = {
         author_name: formData.get('author_name'),
         author_email: formData.get('author_email') || undefined,
         author_url: formData.get('author_url') || undefined,
         content: formData.get('content'),
       };

       submitBtn.disabled = true;
       submitBtn.textContent = 'Submitting...';

       try {
         const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data),
         });

         if (!res.ok) throw new Error('Failed to submit comment');

         form.reset();
         alert('Comment submitted! It will appear after moderation.');
       } catch (err) {
         alert('Failed to submit comment. Please try again.');
       } finally {
         submitBtn.disabled = false;
         submitBtn.textContent = 'Submit';
       }
     });

     function escapeHtml(text: string): string {
       const div = document.createElement('div');
       div.textContent = text;
       return div.innerHTML;
     }

     function formatDate(timestamp: number): string {
       return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
         year: 'numeric',
         month: 'short',
         day: 'numeric',
       });
     }

     // Load on page load
     loadComments();
   </script>
   ```

**UX ref:** UX-004
**User interaction:** User scrolls to bottom of post, sees comment form and existing comments. Submits form, sees "Awaiting moderation" message. Approved comments load automatically from API.
<!-- /section -->

<!-- section: task-8 keywords: category-page, astro, static-paths -->
### Task 8: Category pages

**Files:**
- Create: `packages/web/src/pages/categories/index.astro`
- Create: `packages/web/src/pages/categories/[slug].astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/categories/index.astro`:
   ```astro
   ---
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import { getCategories, type Category } from '../../lib/api';

   const categories = await getCategories();
   ---

   <BaseLayout title="Categories">
     <h1 class="text-3xl font-bold mb-8">Categories</h1>

     {categories.length === 0 ? (
       <p class="text-gray-500">No categories yet.</p>
     ) : (
       <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
         {categories.map((category: Category) => (
           <a
             href={`/categories/${category.slug}`}
             class="block bg-white p-6 rounded-lg border hover:shadow-md transition-shadow"
           >
             <h2 class="text-xl font-semibold mb-2">{category.name}</h2>
             {category.description && (
               <p class="text-gray-600 text-sm">{category.description}</p>
             )}
           </a>
         ))}
       </div>
     )}
   </BaseLayout>
   ```

2. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/categories/[slug].astro`:
   ```astro
   ---
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import { getCategories, getPosts, getCategory, type Category, type Post } from '../../lib/api';

   // Get all categories for static paths
   export async function getStaticPaths() {
     const categories = await getCategories();
     return categories.map((cat: Category) => ({
       params: { slug: cat.slug },
       props: { category: cat },
     }));
   }

   interface Props {
     category: Category;
   }

   const { category } = Astro.props;

   // Fetch posts in this category
   const { data: posts } = await getPosts({ status: 'published', category: category.slug, limit: 100 });

   function formatDate(timestamp: number): string {
     return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
     });
   }
   ---

   <BaseLayout title={category.name} description={category.description || undefined}>
     <div class="mb-8">
       <a href="/categories" class="text-blue-600 hover:underline mb-4 inline-block">&larr; All Categories</a>
       <h1 class="text-3xl font-bold">{category.name}</h1>
       {category.description && <p class="text-gray-600 mt-2">{category.description}</p>}
     </div>

     {posts.length === 0 ? (
       <p class="text-gray-500">No posts in this category.</p>
     ) : (
       <div class="space-y-6">
         {posts.map((post: Post) => (
           <article class="bg-white rounded-lg shadow-sm border p-6">
             <h2 class="text-xl font-semibold mb-2">
               <a href={`/posts/${post.slug}`} class="text-gray-900 hover:text-blue-600">
                 {post.title}
               </a>
             </h2>
             <p class="text-gray-600 mb-3">
               {post.excerpt || post.content.substring(0, 150) + '...'}
             </p>
             <div class="text-sm text-gray-500">
               {post.publishedAt && (
                 <time>{formatDate(post.publishedAt)}</time>
               )}
             </div>
           </article>
         ))}
       </div>
     )}
   </BaseLayout>
   ```

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-9 keywords: tag-page, astro, static-paths -->
### Task 9: Tag pages

**Files:**
- Create: `packages/web/src/pages/tags/index.astro`
- Create: `packages/web/src/pages/tags/[slug].astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/tags/index.astro`:
   ```astro
   ---
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import { getTags, type Tag } from '../../lib/api';

   const tags = await getTags();
   ---

   <BaseLayout title="Tags">
     <h1 class="text-3xl font-bold mb-8">Tags</h1>

     {tags.length === 0 ? (
       <p class="text-gray-500">No tags yet.</p>
     ) : (
       <div class="flex flex-wrap gap-3">
         {tags.map((tag: Tag) => (
           <a
             href={`/tags/${tag.slug}`}
             class="px-4 py-2 bg-white border rounded-full hover:bg-gray-50 transition-colors"
           >
             {tag.name}
           </a>
         ))}
       </div>
     )}
   </BaseLayout>
   ```

2. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/tags/[slug].astro`:
   ```astro
   ---
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import { getTags, getPosts, type Tag, type Post } from '../../lib/api';

   // Get all tags for static paths
   export async function getStaticPaths() {
     const tags = await getTags();
     return tags.map((tag: Tag) => ({
       params: { slug: tag.slug },
       props: { tag },
     }));
   }

   interface Props {
     tag: Tag;
   }

   const { tag } = Astro.props;

   // Fetch posts with this tag
   const { data: posts } = await getPosts({ status: 'published', tag: tag.slug, limit: 100 });

   function formatDate(timestamp: number): string {
     return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
     });
   }
   ---

   <BaseLayout title={`Tag: ${tag.name}`}>
     <div class="mb-8">
       <a href="/tags" class="text-blue-600 hover:underline mb-4 inline-block">&larr; All Tags</a>
       <h1 class="text-3xl font-bold">Tag: {tag.name}</h1>
     </div>

     {posts.length === 0 ? (
       <p class="text-gray-500">No posts with this tag.</p>
     ) : (
       <div class="space-y-6">
         {posts.map((post: Post) => (
           <article class="bg-white rounded-lg shadow-sm border p-6">
             <h2 class="text-xl font-semibold mb-2">
               <a href={`/posts/${post.slug}`} class="text-gray-900 hover:text-blue-600">
                 {post.title}
               </a>
             </h2>
             <p class="text-gray-600 mb-3">
               {post.excerpt || post.content.substring(0, 150) + '...'}
             </p>
             <div class="text-sm text-gray-500">
               {post.publishedAt && (
                 <time>{formatDate(post.publishedAt)}</time>
               )}
             </div>
           </article>
         ))}
       </div>
     )}
   </BaseLayout>
   ```

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-10 keywords: pages, static-page, markdown -->
### Task 10: Static pages from pages table

**Files:**
- Create: `packages/web/src/pages/[slug].astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/[slug].astro`:
   ```astro
   ---
   import BaseLayout from '../layouts/BaseLayout.astro';
   import { getPages, getPosts, type Page, type Post } from '../lib/api';
   import { marked } from 'marked';

   // Get all published pages for static paths
   export async function getStaticPaths() {
     const pages = await getPages();
     const pagePaths = pages
       .filter((p: Page) => p.status === 'published')
       .map((p: Page) => ({
         params: { slug: p.slug },
         props: { page: p },
       }));

     // Also add blog index and archives (excluding any that collide with pages)
     const blogPaths = [
       { params: { slug: 'archives' }, props: { isArchive: true } },
     ];

     return [...pagePaths, ...blogPaths];
   }

   interface Props {
     page?: Page;
     isArchive?: boolean;
   }

   const { page, isArchive } = Astro.props;

   // Handle archive page
   if (isArchive) {
     const { data: posts } = await getPosts({ status: 'published', limit: 100 });

     // Group by year/month
     const archiveMap = new Map<string, Post[]>();
     posts.forEach((post: Post) => {
       if (!post.publishedAt) return;
       const date = new Date(post.publishedAt * 1000);
       const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
       if (!archiveMap.has(key)) archiveMap.set(key, []);
       archiveMap.get(key)!.push(post);
     });

     const sortedYears = [...archiveMap.keys()].sort().reverse();
---

<BaseLayout title="Archives">
  <h1 class="text-3xl font-bold mb-8">Archives</h1>

  {sortedYears.length === 0 ? (
    <p class="text-gray-500">No posts yet.</p>
  ) : (
    sortedYears.map(yearMonth => {
      const [year, month] = yearMonth.split('-');
      const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const posts = archiveMap.get(yearMonth) || [];

      return (
        <div class="mb-8">
          <h2 class="text-2xl font-semibold mb-4">{monthNames[parseInt(month)]} {year}</h2>
          <ul class="space-y-2">
            {posts.map((post: Post) => (
              <li class="bg-white p-3 rounded border">
                <a href={`/posts/${post.slug}`} class="text-gray-900 hover:text-blue-600">
                  {post.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    })
  )}
</BaseLayout>
   } else if (page) {
     const htmlContent = marked.parse(page.content);
---

<BaseLayout title={page.title}>
  <article>
    <h1 class="text-4xl font-bold mb-8">{page.title}</h1>
    <div class="prose prose-lg max-w-none" set:html={htmlContent} />
  </article>
</BaseLayout>
   }
---

**Verify:**
Build will succeed in later task.
<!-- /section -->

<!-- section: task-11 keywords: 404-page, error-page -->
### Task 11: 404 page

**Files:**
- Create: `packages/web/src/pages/404.astro`

**Steps:**
1. Create `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/404.astro`:
   ```astro
   ---
   import BaseLayout from '../layouts/BaseLayout.astro';
   ---

   <BaseLayout title="Page Not Found">
     <div class="text-center py-16">
       <h1 class="text-6xl font-bold text-gray-300 mb-4">404</h1>
       <h2 class="text-2xl font-semibold mb-4">Page Not Found</h2>
       <p class="text-gray-600 mb-8">The page you're looking for doesn't exist or has been moved.</p>
       <a
         href="/"
         class="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
       >
         Go Home
       </a>
     </div>
   </BaseLayout>
   ```

2. Configure Astro to use 404 page. Update `/Users/norvyn/Code/Projects/wordbase/packages/web/astro.config.mjs`:
   ```javascript
   import { defineConfig } from 'astro/config';
   import tailwind from '@astrojs/tailwind';
   import preact from '@astrojs/preact';

   export default defineConfig({
     site: 'https://blog.norvyn.com',
     output: 'static',
     server: { port: 4321 },
     build: {
       outDir: './dist',
     },
     integrations: [tailwind(), preact()],
     build: {
       outDir: './dist',
       format: 'file',
     },
     redirects: {},
   });
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/web && npm run build`
Expected: Build completes successfully with dist/ directory containing index.html, posts/*, categories/*, tags/*, and 404.html
<!-- /section -->

<!-- section: task-12 keywords: tailwind-typography, prose, styling -->
### Task 12: Install and configure Tailwind Typography plugin

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/tailwind.config.mjs`

**Steps:**
1. Add typography plugin to package.json:
   ```json
   "dependencies": {
     "astro": "^4.0.0",
     "@astrojs/tailwind": "^5.1.0",
     "tailwindcss": "^3.4.0",
     "@tailwindcss/typography": "^0.5.10",
     "@astrojs/preact": "^3.0.0",
     "preact": "^10.19.0",
     "marked": "^12.0.0"
   }
   ```

2. Update tailwind.config.mjs to include typography plugin:
   ```javascript
   /** @type {import('tailwindcss').Config} */
   export default {
     content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
     theme: {
       extend: {},
     },
     plugins: [
       require('@tailwindcss/typography'),
     ],
   };
   ```

3. Install new dependency:
   ```bash
   cd /Users/norvyn/Code/Projects/wordbase/packages/web && npm install
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/web && npm run build`
Expected: Build succeeds with typography styles applied to post content
<!-- /section -->

<!-- section: task-13 keywords: build-verify, production -->
### Task 13: Final build verification

**Files:**
- Test: `packages/web/dist/`

**Steps:**
1. Run the build:
   ```bash
   cd /Users/norvyn/Code/Projects/wordbase/packages/web && npm run build
   ```

2. Verify dist/ directory contains:
   - `index.html` - Homepage
   - `posts/*.html` - Post pages
   - `categories/index.html` - Category list
   - `categories/*.html` - Category detail pages
   - `tags/index.html` - Tag list
   - `tags/*.html` - Tag detail pages
   - `404.html` - 404 page
   - `[slug]/index.html` - Static pages

3. Check that a sample post page contains:
   - Rendered markdown content
   - Comment section component
   - Share buttons

**Verify:**
Run: `ls -la /Users/norvyn/Code/Projects/wordbase/packages/web/dist/`
Expected: dist/ contains index.html and subdirectories

Run: `ls /Users/norvyn/Code/Projects/wordbase/packages/web/dist/posts/ 2>/dev/null | head -5`
Expected: Post HTML files exist (if posts exist in API)

Run: `cat /Users/norvyn/Code/Projects/wordbase/packages/web/dist/404.html | head -20`
Expected: 404 page content present

---

## Summary

**Plan file:** docs/06-plans/2026-03-21-wordbase-blog-frontend-plan.md

**Tasks:** 13

**Key files to be created:**
- `packages/web/src/layouts/BaseLayout.astro`
- `packages/web/src/lib/api.ts`
- `packages/web/src/pages/index.astro`
- `packages/web/src/pages/posts/[slug].astro`
- `packages/web/src/pages/categories/index.astro`
- `packages/web/src/pages/categories/[slug].astro`
- `packages/web/src/pages/tags/index.astro`
- `packages/web/src/pages/tags/[slug].astro`
- `packages/web/src/pages/[slug].astro`
- `packages/web/src/pages/404.astro`
- `packages/web/src/components/ShareButtons.astro`
- `packages/web/src/components/CommentSection.astro`

**Key files to be modified:**
- `packages/web/package.json` - Add dependencies
- `packages/web/astro.config.mjs` - Add integrations
- `packages/web/tailwind.config.mjs` - Create with typography plugin

**Decisions:** 2 resolved (DP-001: paginate(), DP-002: split archives)

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21
- **Fixes to apply during execution:**
  - Task 4: Use paginate() instead of query-string pagination
  - Task 10: Split into archives.astro + [slug].astro (DP-002)
  - Task 5 getStaticPaths: Fetch all posts, not limit:100
  - Task 11: Merge duplicate build keys in astro.config
  - All tasks: Use pnpm not npm