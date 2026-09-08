import * as postService from '../services/post.service.js';
import * as tagService from '../services/tag.service.js';
import * as categoryService from '../services/category.service.js';
import * as mediaService from '../services/media.service.js';
import * as commentService from '../services/comment.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as buildService from '../services/build.service.js';
import * as redirectService from '../services/redirect.service.js';
import * as podcastService from '../services/podcast.service.js';
import * as episodeService from '../services/episode.service.js';
import * as podcastAnalytics from '../services/podcast-analytics.service.js';
import * as feedbackService from '../services/feedback.service.js';
import * as appService from '../services/app.service.js';
import * as appSyncService from '../services/app-sync.service.js';
import * as pageService from '../services/page.service.js';
import * as feedImportService from '../services/feed-import.service.js';
import * as i18nContent from '../services/i18n-content.service.js';
import * as searchService from '../services/search.service.js';
import * as siteService from '../services/site.service.js';
import * as settingsService from '../services/settings.service.js';
import * as observabilityService from '../services/observability.service.js';
import * as seoHealthService from '../services/seo-health.service.js';
import { safeFetch } from '../lib/safe-fetch.js';
import { hasScope } from '../middleware/auth.js';
import { z } from 'zod';
import { buildInputSchema, type PropDescriptor } from './schema.js';

// Shared Zod shape for one `features` array entry ({icon, title, blurb}).
// `items` on an array PropDescriptor takes a compiled ZodTypeAny, not a
// nested PropDescriptor, so this is built once via buildInputSchema and
// reused by app_create's `features` param.
const appFeatureItemSchema = z.object(
  buildInputSchema({
    icon: { type: 'string', description: 'Emoji or icon glyph for this feature.' },
    title: { type: 'string', required: true, description: 'Short feature title.' },
    blurb: { type: 'string', description: 'One-sentence explanation of the feature.' },
  })
);

// Shared Zod shape for one `entries` array item passed to i18n_put_cache.
// Same rationale as appFeatureItemSchema above: `items` on an array
// PropDescriptor takes a compiled ZodTypeAny, not a nested PropDescriptor.
const i18nEntryItemSchema = z.object(
  buildInputSchema({
    sourceHash: { type: 'string', required: true, description: 'Hash of the source-language block being translated (from i18n_pending).' },
    lang: { type: 'string', required: true, description: 'Target language code, e.g. en.' },
    text: { type: 'string', required: true, description: 'Translated text for this block.' },
    model: { type: 'string', description: 'Name of the model that produced this translation, for provenance.' },
    humanEdited: { type: 'boolean', description: 'Mark true for a human-reviewed translation — protected from being overwritten by future AI writes.' },
  })
);

// Required scope per MCP tool — mirrors the REST route scopes. Before this, MCP
// tools ran with zero scope checks (#6); the wrapper below enforces them.
export const TOOL_SCOPES: Record<string, string> = {
  post_list: 'posts:read',
  post_get: 'posts:read',
  post_search: 'posts:read',
  post_create: 'posts:write',
  post_update: 'posts:write',
  post_update_meta: 'posts:write',
  post_publish: 'posts:write',
  post_archive: 'posts:write',
  post_delete: 'posts:write',
  // Phase 3 (Taxonomy over MCP) — read scopes for the taxonomy list tools.
  tag_list: 'tags:read',
  category_list: 'categories:read',
  // Phase 3 (Taxonomy over MCP) — write scopes for create/update/delete tools.
  // tag_create is create-or-attach (idempotent); category_create is NOT
  // create-or-attach — the adapter catches the UNIQUE error and returns isError
  // so callers see a clean MCP result instead of a bare exception.
  tag_create: 'tags:write',
  category_create: 'categories:write',
  // Phase 3 — rename of a term attached to a published post rebuilds the site
  // (post page shows the term; tag/category index pages list it).
  tag_update: 'tags:write',
  category_update: 'categories:write',
  // Phase 3 — delete of a term attached to a published post rebuilds the site
  // (post page loses the term; term-listing pages also drop it). Junction rows
  // are cleared by the DB ON DELETE CASCADE — the adapter doesn't touch them.
  tag_delete: 'tags:write',
  category_delete: 'categories:write',
  media_list: 'media:read',
  media_upload: 'media:write',
  media_delete: 'media:write',
  media_upload_from_url: 'media:write',
  comment_list: 'comments:read',
  comment_moderate: 'comments:write',
  comment_reply: 'comments:write',
  comment_delete: 'comments:write',
  // Mirrors the REST gate: the identical analytics service calls are served by
  // /api/observability/top-posts (and its overview/trends/content-stats
  // siblings) under 'observability:read'. Gating this MCP tool with the old
  // 'analytics:read' would let a posts-CRUD key read analytics it's denied
  // over REST (scope-mismatch privilege escalation) — same reasoning as
  // podcast_analytics below.
  analytics_query: 'observability:read',
  build_trigger: 'build:trigger',
  build_status: 'build:read',
  redirect_manage: 'redirects:write',
  podcast_list_shows: 'podcasts:read',
  podcast_create_show: 'podcasts:write',
  podcast_update_show: 'podcasts:write',
  podcast_publish_show: 'podcasts:write',
  podcast_list_episodes: 'podcasts:read',
  podcast_create_episode: 'podcasts:write',
  podcast_update_episode: 'podcasts:write',
  podcast_upload_audio_from_url: 'podcasts:write',
  podcast_publish_episode: 'podcasts:write',
  podcast_import_feed: 'podcasts:write',
  podcast_get_feedback: 'podcasts:read',
  // Mirrors the REST gate: the identical analytics service calls are served by
  // /api/observability/podcast/* under 'observability:read'. Gating the MCP tool
  // with 'podcasts:read' would let a podcast-CRUD key read analytics it's denied
  // over REST (scope-mismatch privilege escalation), so it must match.
  podcast_analytics: 'observability:read',
  app_list: 'apps:read',
  app_create: 'apps:write',
  app_publish: 'apps:write',
  app_update: 'apps:write',
  app_discover: 'apps:write',
  app_sync: 'apps:write',
  page_list: 'pages:read',
  page_get: 'pages:read',
  page_create: 'pages:write',
  page_update: 'pages:write',
  page_delete: 'pages:write',
  page_publish: 'pages:write',
  // i18n tools — mirrors the REST /api/i18n/* route scopes. i18n_render is
  // public over REST (Phase 4 build needs no key) but MCP has no anonymous
  // concept, so we require i18n:read here. Same service on both sides.
  i18n_render: 'i18n:read',
  i18n_pending: 'i18n:read',
  i18n_put_cache: 'i18n:write',
  // Task 12 (DP-002 = A) — REST-parity get/delete tools, scoped like their
  // list/publish siblings above.
  app_get: 'apps:read',
  app_delete: 'apps:write',
  media_get: 'media:read',
  podcast_get_show: 'podcasts:read',
  podcast_delete_show: 'podcasts:write',
  podcast_get_episode: 'podcasts:read',
  podcast_delete_episode: 'podcasts:write',
  tag_get: 'tags:read',
  category_get: 'categories:read',
  // Site identity — GET /api/settings/site is public over REST (no anonymous
  // concept in MCP, same reasoning as i18n_render above); PUT has no REST
  // equivalent endpoint, it's a settings_update_site-only capability layered
  // on updateSettings (see Task 12 step 2 / site.service.ts).
  settings_get_site: 'settings:read',
  settings_update_site: 'settings:write',
  // Mirrors the REST mount-level gate: /api/observability/* all requires
  // 'observability:read' (routes/observability.ts).
  observability_query: 'observability:read',
};

// Non-Zod-schema metadata for a tool registration: a human-facing title and
// the MCP behavioral-hint annotations. Fields are individually optional here
// so existing call sites (which don't yet pass a 5th argument) keep compiling;
// per SDK defaults (dist/esm/spec.types.d.ts) an *omitted* readOnlyHint reads
// as false and an omitted destructiveHint reads as true, so tools that do pass
// meta must set both explicitly rather than relying on the default.
type ToolMeta = {
  title?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

// The undecorated { type, description, ... } descriptor per tool, keyed by
// tool name — populated by the shim as a side effect of registration. Used by
// scripts/generate-mcp-catalog.mts to render the Type/required/enum columns
// from the source-of-truth descriptor instead of reverse-engineering a
// compiled Zod instance (which is both fragile and prone to silently
// degrading the rendered type).
export const REGISTERED_DESCRIPTORS = new Map<string, Record<string, PropDescriptor>>();

export function registerTools(realServer: any, permissions: string[] = ['*']) {
  // Wrap the SDK's tool() so each registration below is gated by its TOOL_SCOPES
  // entry, without editing every call site. A tool the calling key lacks scope
  // for is simply not registered — it never appears in tools/list, and there's
  // no "listed but denied at call time" state for the client to stumble into.
  // A tool with no TOOL_SCOPES entry at all is a scope-mapping bug, not an
  // access decision, so it throws at registration time (deny-by-default; see
  // Threat Model "Failure modes" — a missing entry must never silently fall
  // through to "registered for everyone").
  const server = {
    tool(
      name: string,
      description: string,
      shape: Record<string, PropDescriptor>,
      handler: (...args: any[]) => any,
      meta: ToolMeta = {},
    ) {
      const scope = TOOL_SCOPES[name];
      if (!scope) throw new Error(`MCP tool "${name}" has no TOOL_SCOPES entry`);
      if (!hasScope(permissions, scope)) return; // not registered — key lacks scope

      REGISTERED_DESCRIPTORS.set(name, shape);
      if (typeof realServer.registerTool === 'function') {
        return realServer.registerTool(
          name,
          {
            title: meta.title,
            description,
            inputSchema: buildInputSchema(shape),
            annotations: meta.annotations,
          },
          handler,
        );
      }
      // Fallback for doubles that only implement the older tool() signature
      // (the 9 local fakes across mcp.*.test.ts and the catalog generator's
      // mockServer) — none of them define registerTool.
      return realServer.tool(name, description, buildInputSchema(shape), handler);
    },
  };

  server.tool(
    'post_list',
    'List blog posts with optional filtering. Returns summary fields only (no content/meta) — use post_get for the full post body.',
    {
      status: {
        type: 'string',
        enum: ['draft', 'published', 'archived'],
        description:
          "Filter by status. 用户说『只看草稿』时用 draft,『看已发布的』用 published,『看已下架的』用 archived. Example: status: 'published'.",
      },
      category: { type: 'string', description: "Filter by category slug, e.g. category: 'life-notes'." },
      tag: { type: 'string', description: "Filter by tag slug, e.g. tag: 'ai'." },
      page: { type: 'number', min: 1, description: 'Page number, 1-based (default: 1).' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 10, max 100).' },
      search: { type: 'string', description: "Search in post titles, e.g. search: '发布'." },
    },
    async (args: Record<string, unknown>) => {
      const result = await postService.listPosts({
        status: args.status as string | undefined,
        category: args.category as string | undefined,
        tag: args.tag as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
        search: args.search as string | undefined,
        fields: 'summary',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List blog posts',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_get',
    'Get a single blog post by ID or slug, including its tags and categories',
    {
      idOrSlug: {
        type: 'string',
        required: true,
        description:
          "Post ID or slug. 用户说『打开/看看那篇 XX』时,先用 post_search 或 post_list 找到 id/slug 再传进来. Example: idOrSlug: 'rss-explained'.",
      },
    },
    async (args: { idOrSlug: string }) => {
      const post = await postService.getPostWithTerms(args.idOrSlug);
      if (!post) {
        return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] };
    },
    {
      title: 'Get blog post',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_search',
    'Full-text search published blog posts (LIKE). Returns title + snippet.',
    {
      q: {
        type: 'string',
        required: true,
        description: "Search query (Chinese supported). 用户说『搜一下关于 XX 的文章』时,q 就是 XX. Example: q: 'RSS'.",
      },
      limit: {
        type: 'number',
        min: 1,
        max: 100,
        description:
          'Max results (default 20). The search service caps at 50 regardless of what is requested here — values above 50 are silently truncated by the service, not by this schema.',
      },
    },
    async (args: Record<string, unknown>) => {
      const results = await searchService.searchPosts(
        (args.q as string) ?? '',
        args.limit as number | undefined,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(results) }] };
    },
    {
      title: 'Search blog posts',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_create',
    'Create a new blog post with a title and Markdown content',
    {
      title: {
        type: 'string',
        required: true,
        description:
          "Post title. 用户说『写一篇关于 XX 的文章』时,XX 通常就是这个字段的值. Example: title: 'RSS 是什么'.",
      },
      content: {
        type: 'string',
        required: true,
        description:
          "Post content in Markdown. 把用户口述/给定的正文直接转成 Markdown 传入. Example: content: '# 引言\\n\\n正文……'.",
      },
      slug: { type: 'string', description: "URL slug (auto-generated if not provided). Example: slug: 'rss-explained'." },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description:
          "Post status. 用户说『先存草稿』时用 draft(默认);说『直接发布』/『上线』时用 published. Example: status: 'draft'.",
      },
      categoryIds: {
        type: 'array',
        items: 'string',
        description:
          "Category IDs to attach — pass an array like [\"cat1\",\"cat2\"] (a comma-separated string is also accepted). 用户说『放进随笔分类』时,先用 category_list 查到 id 再传进来.",
      },
      tagIds: {
        type: 'array',
        items: 'string',
        description:
          "Tag IDs to attach — pass an array like [\"tag1\",\"tag2\"] (a comma-separated string is also accepted). 用户说『加上『AI』标签』时,先用 tag_list 或 tag_create 拿到 id 再传进来.",
      },
    },
    async (args: Record<string, unknown>) => {
      const post = await postService.createPost({
        title: args.title as string,
        content: args.content as string,
        slug: args.slug as string | undefined,
        status: args.status as string | undefined,
        categoryIds: args.categoryIds as string[] | undefined,
        tagIds: args.tagIds as string[] | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] };
    },
    {
      title: 'Create blog post',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_update',
    'Update a blog post (editorial fields: title/content/slug/excerpt/status/tags/categories). For SEO meta use post_update_meta.',
    {
      id: { type: 'string', required: true, description: 'Post ID.' },
      title: { type: 'string', description: 'New title.' },
      content: { type: 'string', description: 'New Markdown content.' },
      slug: { type: 'string', description: 'New slug (normalized).' },
      excerpt: { type: 'string', description: 'New excerpt.' },
      status: {
        type: 'string',
        enum: ['draft', 'published', 'archived'],
        description:
          "用户说『先存草稿』→ draft;『发布』/『上线』→ published;『下架』→ archived. Example: status: 'archived'.",
      },
      categoryIds: {
        type: 'array',
        items: 'string',
        description:
          'Category IDs — a full-replacement array (comma-separated string also accepted), not an append: passing it replaces the whole set. Pass an empty array to clear all; omit the field entirely to keep the current set unchanged.',
      },
      tagIds: {
        type: 'array',
        items: 'string',
        description:
          'Tag IDs — a full-replacement array (comma-separated string also accepted), not an append: passing it replaces the whole set. Pass an empty array to clear all; omit the field entirely to keep the current set unchanged.',
      },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const before = await postService.getPost(id);
      if (!before) return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      // DP-004: undefined=keep, []=clear, [...]=set — the `=== undefined` check
      // is what distinguishes clear from keep (a plain falsy check would make
      // an empty array a no-op, losing clear). The schema (mcp/schema.ts)
      // already normalizes a legacy comma-string caller into an array when the
      // request passes through the real MCP SDK's Zod parsing; callers that
      // invoke this handler directly (bypassing that parse step, as several
      // tests do) may still hand it a raw comma-string, so fall back to
      // splitting when the value isn't already an array.
      const idsOrUndefined = (v: unknown): string[] | undefined => {
        if (v === undefined) return undefined;
        if (Array.isArray(v)) return v as string[];
        return (v as string).split(',').map(s => s.trim()).filter(Boolean);
      };
      const updated = await postService.updatePost(id, {
        title: args.title as string | undefined,
        content: args.content as string | undefined,
        slug: args.slug as string | undefined,
        excerpt: args.excerpt as string | undefined,
        status: args.status as string | undefined,
        categoryIds: idsOrUndefined(args.categoryIds),
        tagIds: idsOrUndefined(args.tagIds),
      });
      if (updated && (updated.status === 'published' || before.status === 'published')) buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(updated) }] };
    },
    {
      title: 'Update blog post',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_publish',
    'Publish a draft blog post (idempotent: already-published returns as-is). Rebuilds the static site.',
    { id: { type: 'string', required: true, description: 'Post ID.' } },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const before = await postService.getPost(id);
      if (!before) return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      if (before.status === 'published') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...before, alreadyPublished: true }) }] };
      }
      const post = await postService.publishPost(id);
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] };
    },
    {
      title: 'Publish blog post',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  server.tool(
    'post_archive',
    'Archive a blog post. Rebuilds the static site only if the post was previously published (so the live page is removed).',
    { id: { type: 'string', required: true, description: 'Post ID.' } },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const before = await postService.getPost(id);
      if (!before) return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      const post = await postService.archivePost(id);
      if (before.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] };
    },
    {
      title: 'Archive blog post',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'post_delete',
    'Delete a blog post. Rebuilds the static site only if the post was previously published (so the live page is removed).',
    { id: { type: 'string', required: true, description: 'Post ID.' } },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const before = await postService.getPost(id);
      if (!before) return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      const deleted = await postService.deletePost(id);
      if (before.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id }) }] };
    },
    {
      title: 'Delete blog post',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  // Taxonomy tools (Phase 3)
  server.tool(
    'tag_list',
    'List all tags with the number of posts that use each (postCount).',
    {},
    async () => {
      const tags = await tagService.listTagsWithCounts();
      return { content: [{ type: 'text' as const, text: JSON.stringify(tags) }] };
    },
    {
      title: 'List tags',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'category_list',
    'List all categories with the number of posts in each (postCount).',
    {},
    async () => {
      const categories = await categoryService.listCategoriesWithCounts();
      return { content: [{ type: 'text' as const, text: JSON.stringify(categories) }] };
    },
    {
      title: 'List categories',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'tag_get',
    'Get a single tag by ID or slug.',
    {
      idOrSlug: { type: 'string', required: true, description: "Tag ID or slug. Example: idOrSlug: 'ai'." },
    },
    async (args: Record<string, unknown>) => {
      const tag = await tagService.getTag(args.idOrSlug as string);
      if (!tag) return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(tag) }] };
    },
    {
      title: 'Get tag',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'category_get',
    'Get a single category by ID or slug.',
    {
      idOrSlug: { type: 'string', required: true, description: "Category ID or slug. Example: idOrSlug: 'life-notes'." },
    },
    async (args: Record<string, unknown>) => {
      const category = await categoryService.getCategory(args.idOrSlug as string);
      if (!category) return { content: [{ type: 'text' as const, text: 'Category not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(category) }] };
    },
    {
      title: 'Get category',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  // tag_create: wrap createTag. createTag is create-or-attach by design (tag.service:67),
  // so re-posting an existing name returns the same row instead of throwing.
  server.tool(
    'tag_create',
    'Create a tag. If a tag with the same slug already exists, returns the existing one (create-or-attach, idempotent).',
    {
      name: {
        type: 'string',
        required: true,
        description: "Tag name. 用户说『加上『随笔』标签』时,name 就是『随笔』. Example: name: '随笔'.",
      },
      slug: { type: 'string', description: 'URL slug (auto-generated from name if omitted).' },
    },
    async (args: Record<string, unknown>) => {
      const tag = await tagService.createTag({
        name: args.name as string,
        slug: args.slug as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(tag) }] };
    },
    {
      title: 'Create tag',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  // category_create: wrap createCategory. Unlike createTag, createCategory is NOT
  // create-or-attach — it inserts directly and a duplicate slug throws on the
  // UNIQUE constraint. Catch and surface as MCP isError (verifier NICE-4) so
  // callers don't see a bare exception. CJK names work via the slugifyCategory
  // helper in category.service.ts (DP-005).
  server.tool(
    'category_create',
    'Create a category. NOT idempotent — posting a duplicate slug returns isError (no create-or-attach).',
    {
      name: {
        type: 'string',
        required: true,
        description: "Category name. 用户说『新建一个『生活笔记』分类』时,name 就是『生活笔记』. Example: name: '生活笔记'.",
      },
      slug: { type: 'string', description: 'URL slug (auto-generated from name if omitted).' },
      description: { type: 'string', description: 'Optional description.' },
      sortOrder: { type: 'number', description: 'Sort order (default: 0).' },
    },
    async (args: Record<string, unknown>) => {
      try {
        const cat = await categoryService.createCategory({
          name: args.name as string,
          slug: args.slug as string | undefined,
          description: args.description as string | undefined,
          sortOrder: args.sortOrder as number | undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(cat) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Create failed';
        // SQLite UNIQUE failures surface here as raw error text; map to a clean
        // MCP isError so clients don't crash on a thrown exception.
        if (/UNIQUE/i.test(message)) {
          return { content: [{ type: 'text' as const, text: `category slug already exists` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Create failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Create category',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // tag_update: wrap updateTag. Before mutating, check usedByPublished: if the
  // tag is on any published post, the static site must rebuild so the tag name
  // and any tag-listing pages stay consistent (routes/posts.ts mirrors this
  // before-status check on post edits).
  server.tool(
    'tag_update',
    "Update a tag's name or slug. Rebuilds the static site only if the tag is attached to at least one published post.",
    {
      id: { type: 'string', required: true, description: 'Tag ID.' },
      name: { type: 'string', description: "New tag name. 用户说『把标签改叫 XX』时,name 就是 XX." },
      slug: { type: 'string', description: 'New URL slug.' },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      // Pre-check usedByPublished (before update) — after the rename we could
      // still query, but the tag's junction rows are unaffected by tag edits,
      // so either order works. Pre-check is simpler and matches how
      // routes/posts.ts reads `before.status` before mutating.
      const used = await tagService.tagUsedByPublished(id);
      try {
        const tag = await tagService.updateTag(id, {
          name: args.name as string | undefined,
          slug: args.slug as string | undefined,
        });
        if (!tag) {
          return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };
        }
        if (used) buildService.triggerBuild();
        return { content: [{ type: 'text' as const, text: JSON.stringify(tag) }] };
      } catch (error) {
        // An explicit duplicate `slug` throws a raw UNIQUE error; map to isError
        // for symmetry with category_create (G-1) so it never crosses MCP raw.
        const message = error instanceof Error ? error.message : 'Update failed';
        if (/UNIQUE/i.test(message)) {
          return { content: [{ type: 'text' as const, text: `tag slug already exists` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Update failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Update tag',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // category_update: wrap updateCategory with the same usedByPublished guard.
  server.tool(
    'category_update',
    "Update a category's name, slug, description, or sortOrder. Rebuilds the static site only if the category is attached to at least one published post.",
    {
      id: { type: 'string', required: true, description: 'Category ID.' },
      name: { type: 'string', description: "New category name. 用户说『把分类改叫 XX』时,name 就是 XX." },
      slug: { type: 'string', description: 'New URL slug.' },
      description: { type: 'string', description: 'New description.' },
      sortOrder: { type: 'number', description: 'New sort order.' },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const used = await categoryService.categoryUsedByPublished(id);
      try {
        const cat = await categoryService.updateCategory(id, {
          name: args.name as string | undefined,
          slug: args.slug as string | undefined,
          description: args.description as string | undefined,
          sortOrder: args.sortOrder as number | undefined,
        });
        if (!cat) {
          return { content: [{ type: 'text' as const, text: 'Category not found' }], isError: true };
        }
        if (used) buildService.triggerBuild();
        return { content: [{ type: 'text' as const, text: JSON.stringify(cat) }] };
      } catch (error) {
        // Duplicate `slug` → raw UNIQUE; map to isError, symmetric with category_create (G-1).
        const message = error instanceof Error ? error.message : 'Update failed';
        if (/UNIQUE/i.test(message)) {
          return { content: [{ type: 'text' as const, text: `category slug already exists` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Update failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Update category',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // tag_delete: wrap deleteTag. Reads usedByPublished BEFORE deleting (after
  // delete the junction is gone and the helper would return false — Threat
  // Model 2 stale-site regression). DB ON DELETE CASCADE clears post_tags rows.
  server.tool(
    'tag_delete',
    'Delete a tag. The DB cascades to drop the tag from any posts that referenced it; rebuilds the static site only if the tag was attached to at least one published post.',
    {
      id: { type: 'string', required: true, description: 'Tag ID.' },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const used = await tagService.tagUsedByPublished(id);
      const tag = await tagService.deleteTag(id);
      if (!tag) {
        return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };
      }
      if (used) buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id }) }] };
    },
    {
      title: 'Delete tag',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  // category_delete: mirror tag_delete with categoryUsedByPublished.
  server.tool(
    'category_delete',
    'Delete a category. The DB cascades to drop the category from any posts that referenced it; rebuilds the static site only if the category was attached to at least one published post.',
    {
      id: { type: 'string', required: true, description: 'Category ID.' },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string;
      const used = await categoryService.categoryUsedByPublished(id);
      const cat = await categoryService.deleteCategory(id);
      if (!cat) {
        return { content: [{ type: 'text' as const, text: 'Category not found' }], isError: true };
      }
      if (used) buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id }) }] };
    },
    {
      title: 'Delete category',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  // Media tools
  server.tool(
    'media_list',
    'List media library items (uploaded images and files), paginated',
    {
      page: { type: 'number', min: 1, description: 'Page number, 1-based (default: 1).' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 20, max 100).' },
    },
    async (args: Record<string, unknown>) => {
      const result = await mediaService.listMedia({
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List media library items',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'media_get',
    'Get a single media library item by ID.',
    {
      id: { type: 'string', required: true, description: 'Media ID.' },
    },
    async (args: Record<string, unknown>) => {
      const media = await mediaService.getMedia(args.id as string);
      if (!media) return { content: [{ type: 'text' as const, text: 'Media not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(media) }] };
    },
    {
      title: 'Get media item',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'media_upload',
    'Upload a file to the media library (base64 encoded)',
    {
      filename: { type: 'string', required: true, description: "Original filename, e.g. filename: 'cover.png'." },
      content: {
        type: 'string',
        required: true,
        description:
          'Base64 encoded file content — raw base64 only, do not include a data: URI prefix (e.g. no "data:image/png;base64," before it). Keep uploads small (a few MB); large files should not be pushed through the model context.',
      },
      mimeType: {
        type: 'string',
        required: true,
        description: "MIME type, e.g. mimeType: 'image/png' or 'image/jpeg'.",
      },
      altText: { type: 'string', description: "Alt text for the image (optional). Example: altText: '封面图'." },
    },
    async (args: Record<string, unknown>) => {
      try {
        const content = Buffer.from(args.content as string, 'base64');
        const file = {
          name: args.filename as string,
          type: args.mimeType as string,
          size: content.length,
          arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
        };
        const record = await mediaService.uploadMedia({
          file,
          altText: args.altText as string | undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(record) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Upload media',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'media_delete',
    'Delete a media item from the media library by ID',
    {
      id: { type: 'string', required: true, description: 'Media ID to delete.' },
    },
    async (args: { id: string }) => {
      const deleted = await mediaService.deleteMedia(args.id);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Media not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete media item',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  // media_upload_from_url (DP-003 = A): fetch server-side instead of passing
  // base64 through the model context. Reuses the safeFetch + MIME/filename
  // derivation from podcast_upload_audio_from_url below, but stores into the
  // media library via mediaService.uploadMedia (not episodeService), so the
  // File-like object construction mirrors media_upload above instead.
  server.tool(
    'media_upload_from_url',
    'Fetch a file from a URL on the server and store it in the media library (avoids passing base64 through the client). Returns the hosted media record.',
    {
      url: { type: 'string', required: true, description: 'Public URL of the file to fetch' },
      filename: { type: 'string', description: 'Filename to store as (default: derived from the URL)' },
      mimeType: { type: 'string', description: 'MIME type override (default: from the response Content-Type)' },
      altText: { type: 'string', description: "Alt text for the image (optional). Example: altText: '封面图'." },
    },
    async (args: Record<string, unknown>) => {
      const url = args.url as string;
      try {
        const resp = await safeFetch(url);
        if (!resp.ok) {
          return { content: [{ type: 'text' as const, text: `Fetch failed: ${resp.status} ${resp.statusText}` }], isError: true };
        }
        const buffer = Buffer.from(await resp.arrayBuffer());
        const filename = (args.filename as string) || url.split('/').pop()?.split('?')[0] || 'file';
        const mimeType = ((args.mimeType as string) || resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
        const file = {
          name: filename,
          type: mimeType,
          size: buffer.length,
          arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        };
        const record = await mediaService.uploadMedia({
          file,
          altText: args.altText as string | undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(record) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Upload media from URL',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }
  );

  // Comment tools
  server.tool(
    'comment_list',
    'List comments for a blog post, optionally filtered by status',
    {
      postId: { type: 'string', required: true, description: 'Post ID to list comments for.' },
      status: {
        type: 'string',
        enum: ['approved', 'pending', 'spam', 'trash'],
        description:
          "Filter by status (default: approved). 用户说『看看待审的评论』时用 pending,『看看垃圾评论』用 spam. Example: status: 'pending'.",
      },
      page: { type: 'number', min: 1, description: 'Page number, 1-based (default: 1).' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 20, max 100).' },
    },
    async (args: Record<string, unknown>) => {
      const result = await commentService.listComments(args.postId as string, {
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List post comments',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'comment_moderate',
    'Moderate a comment (approve, spam, or trash)',
    {
      id: { type: 'string', required: true, description: 'Comment ID to moderate.' },
      action: {
        type: 'string',
        required: true,
        enum: ['approve', 'spam', 'trash'],
        description:
          "用户说『通过这条评论』用 approve,『标成垃圾』用 spam,『删掉/丢进回收站』用 trash. Example: action: 'approve'.",
      },
    },
    async (args: { id: string; action: string }) => {
      const statusMap: Record<string, string> = { approve: 'approved', spam: 'spam', trash: 'trash' };
      const status = statusMap[args.action];
      if (!status) {
        // Unreachable once the schema enum rejects other values — kept as
        // defense in depth per Task 5 step 2.
        return { content: [{ type: 'text' as const, text: 'Invalid action. Use: approve, spam, or trash' }], isError: true };
      }
      const comment = await commentService.updateCommentStatus(args.id, status);
      if (!comment) {
        return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment) }] };
    },
    {
      title: 'Moderate comment',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'comment_reply',
    'Reply to an existing comment as the site owner',
    {
      postId: { type: 'string', required: true, description: 'Post ID the comment belongs to.' },
      parentId: { type: 'string', required: true, description: 'Parent comment ID to reply to.' },
      authorName: {
        type: 'string',
        required: true,
        description: "Author name shown on the reply when the site owner replies. Example: authorName: '站长'.",
      },
      content: { type: 'string', required: true, description: 'Reply content (plain text).' },
    },
    async (args: Record<string, unknown>) => {
      try {
        const comment = await commentService.createComment(args.postId as string, {
          authorName: args.authorName as string,
          content: args.content as string,
          parentId: args.parentId as string,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(comment) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create reply';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
    {
      title: 'Reply to comment',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'comment_delete',
    'Delete a comment from a blog post by ID',
    {
      id: { type: 'string', required: true, description: 'Comment ID to delete.' },
    },
    async (args: { id: string }) => {
      const deleted = await commentService.deleteComment(args.id);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete comment',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  // Analytics tools (DP-004 = A: merged from the 4 former blog_analytics_*/
  // blog_content_stats tools into one, selectable via `sections`).
  server.tool(
    'analytics_query',
    'Query blog analytics. `sections` selects which parts to return (default: all): overview (total PV, today PV, active posts), top_posts (ranked by page views), trends (traffic over time, bucketed by period), content_stats (publish frequency + tag distribution).',
    {
      sections: {
        type: 'array',
        items: 'string',
        enum: ['overview', 'top_posts', 'trends', 'content_stats'],
        description:
          "Which sections to return (default: all four). Example: sections: ['overview', 'top_posts'].",
      },
      limit: {
        type: 'number',
        min: 1,
        max: 100,
        description: 'Number of top posts to return when top_posts is included (default: 10, max 100).',
      },
      period: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description:
          "Period bucket for trends when included. 用户问『最近流量趋势』时默认用 daily;问『这几周』用 weekly;问『按月看』用 monthly. Example: period: 'weekly'.",
      },
    },
    async (args: Record<string, unknown>) => {
      const ALL_SECTIONS = ['overview', 'top_posts', 'trends', 'content_stats'] as const;
      const sections = (args.sections as string[] | undefined) ?? [...ALL_SECTIONS];
      // Defence in depth behind the schema's enum: the handler is also reachable
      // through the tool() fallback path (test doubles call it with raw args, so
      // Zod never runs). Without this, an unknown section is silently dropped and
      // the tool answers {} with no isError — which reads as "no data" rather
      // than "you misspelled a section". observability_query rejects an unknown
      // selector the same way; the two multiplexers must not disagree.
      const unknown = sections.filter((s) => !(ALL_SECTIONS as readonly string[]).includes(s));
      if (unknown.length > 0) {
        return {
          content: [{ type: 'text' as const, text: `Unknown section(s): ${unknown.join(', ')}. Valid: ${ALL_SECTIONS.join(', ')}` }],
          isError: true,
        };
      }
      if (sections.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `sections is empty — omit it for all sections, or name at least one of: ${ALL_SECTIONS.join(', ')}` }],
          isError: true,
        };
      }
      const limit = (args.limit as number | undefined) ?? 10;
      const period = (args.period as string | undefined) ?? 'daily';
      const want = (s: string) => sections.includes(s);
      const [overview, topPosts, trends, contentStats] = await Promise.all([
        want('overview') ? analyticsService.getOverview() : Promise.resolve(undefined),
        want('top_posts') ? analyticsService.getTopPosts(limit) : Promise.resolve(undefined),
        want('trends') ? analyticsService.getTrends(period) : Promise.resolve(undefined),
        want('content_stats') ? analyticsService.getContentStats() : Promise.resolve(undefined),
      ]);
      const result: Record<string, unknown> = {};
      if (overview !== undefined) result.overview = overview;
      if (topPosts !== undefined) result.topPosts = topPosts;
      if (trends !== undefined) result.trends = trends;
      if (contentStats !== undefined) result.contentStats = contentStats;
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'Query blog analytics',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  // Build tools
  server.tool(
    'build_trigger',
    'Trigger an Astro static site rebuild for the blog',
    {},
    async () => {
      const status = await buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(status) }] };
    },
    {
      title: 'Trigger site rebuild',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  server.tool(
    'build_status',
    'Check the current Astro site build status',
    {},
    async () => {
      const status = buildService.getBuildStatus();
      return { content: [{ type: 'text' as const, text: JSON.stringify(status) }] };
    },
    {
      title: 'Get build status',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  // Redirect tools
  server.tool(
    'redirect_manage',
    "List, create, or delete URL redirects. 'list' needs no other fields. 'create' needs fromPath + toPath. 'delete' needs id.",
    {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'create', 'delete'],
        description:
          "Action to perform. 用户说『看看有哪些跳转』用 list;『加一条跳转』用 create(还需 fromPath+toPath);『删掉这条跳转』用 delete(还需 id).",
      },
      fromPath: { type: 'string', description: "Source path, required for create. Example: fromPath: '/old-slug'." },
      toPath: { type: 'string', description: "Target path, required for create. Example: toPath: '/new-slug'." },
      id: { type: 'string', description: 'Redirect ID, required for delete.' },
    },
    async (args: Record<string, unknown>) => {
      const action = args.action as string;
      if (action === 'list') {
        const list = await redirectService.listRedirects();
        return { content: [{ type: 'text' as const, text: JSON.stringify(list) }] };
      }
      if (action === 'create') {
        const record = await redirectService.createRedirect({
          fromPath: args.fromPath as string,
          toPath: args.toPath as string,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(record) }] };
      }
      if (action === 'delete') {
        const deleted = await redirectService.deleteRedirect(args.id as string);
        if (!deleted) return { content: [{ type: 'text' as const, text: 'Redirect not found' }], isError: true };
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
      }
      return { content: [{ type: 'text' as const, text: 'Invalid action. Use: list, create, or delete' }], isError: true };
    },
    {
      title: 'Manage URL redirects',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // Podcast tools
  server.tool(
    'podcast_list_shows',
    'List all podcast shows, optionally filtered by status',
    {
      status: { type: 'string', enum: ['draft', 'published'], description: 'Filter by status: draft or published' },
      page: { type: 'number', min: 1, description: 'Page number (default: 1)' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await podcastService.listPodcasts({
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List podcast shows',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_get_show',
    'Get a single podcast show by ID or slug.',
    {
      idOrSlug: { type: 'string', required: true, description: "Podcast show ID or slug. Example: idOrSlug: 'the-show'." },
    },
    async (args: Record<string, unknown>) => {
      const show = await podcastService.getPodcast(args.idOrSlug as string);
      if (!show) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(show) }] };
    },
    {
      title: 'Get podcast show',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_create_show',
    'Create a new podcast show with title, description, and owner info',
    {
      title: { type: 'string', required: true, description: 'Show title' },
      description: { type: 'string', description: 'Show description' },
      ownerEmail: { type: 'string', description: 'Owner email for iTunes feed' },
      ownerName: { type: 'string', description: 'Owner name for iTunes feed' },
      author: { type: 'string', description: 'Author name' },
      language: { type: 'string', description: 'Language code (default: zh-CN)' },
      category: { type: 'string', description: 'iTunes category' },
      explicit: { type: 'boolean', description: 'Explicit content flag. Accepts true/false (also accepts legacy 1/0).' },
      coverImage: { type: 'string', description: 'Cover image URL' },
      appleUrl: { type: 'string', description: 'Apple Podcasts show URL' },
      spotifyUrl: { type: 'string', description: 'Spotify show URL' },
      slug: { type: 'string', description: 'URL slug (auto-generated if not provided)' },
    },
    async (args: Record<string, unknown>) => {
      const show = await podcastService.createPodcast({
        title: args.title as string,
        description: args.description as string | undefined,
        ownerEmail: args.ownerEmail as string | undefined,
        ownerName: args.ownerName as string | undefined,
        author: args.author as string | undefined,
        language: args.language as string | undefined,
        category: args.category as string | undefined,
        explicit: args.explicit === undefined ? undefined : (args.explicit ? 1 : 0),
        coverImage: args.coverImage as string | undefined,
        appleUrl: args.appleUrl as string | undefined,
        spotifyUrl: args.spotifyUrl as string | undefined,
        slug: args.slug as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(show) }] };
    },
    {
      title: 'Create podcast show',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_publish_show',
    'Publish a podcast show so it appears on the public site',
    {
      id: { type: 'string', required: true, description: 'Podcast show ID' },
    },
    async (args: { id: string }) => {
      const show = await podcastService.publishPodcast(args.id);
      if (!show) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      // Mirror the REST route (routes/podcasts.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(show) }] };
    },
    {
      title: 'Publish podcast show',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_delete_show',
    'Delete a podcast show. Rebuilds the static site only if the show was previously published (so the live show page and its RSS feed are removed).',
    {
      id: { type: 'string', required: true, description: 'Podcast show ID.' },
    },
    async (args: Record<string, unknown>) => {
      const deleted = await podcastService.deletePodcast(args.id as string);
      if (!deleted) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      if (deleted.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete podcast show',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_list_episodes',
    'List episodes for a podcast show, optionally filtered by status. Returns summary fields only — excludes transcript and full show notes to keep the response small.',
    {
      podcastId: { type: 'string', required: true, description: 'Podcast show ID' },
      status: { type: 'string', enum: ['draft', 'published'], description: 'Filter by status: draft or published' },
      page: { type: 'number', min: 1, description: 'Page number (default: 1)' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await episodeService.listEpisodes(args.podcastId as string, {
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
        fields: 'summary',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List podcast episodes',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_get_episode',
    'Get a single podcast episode by ID or slug, including transcript and full show notes.',
    {
      idOrSlug: { type: 'string', required: true, description: "Episode ID or slug. Example: idOrSlug: 'ep-42'." },
    },
    async (args: Record<string, unknown>) => {
      const episode = await episodeService.getEpisode(args.idOrSlug as string);
      if (!episode) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode) }] };
    },
    {
      title: 'Get podcast episode',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_analytics',
    'Podcast consumption analytics: deduped downloads (total + windowed), active-subscriber estimate, top episodes, and feed-poll client distribution',
    {
      days: { type: 'number', min: 1, max: 365, description: 'Window in days for windowed downloads (default: 30)' },
      limit: { type: 'number', description: 'Max top episodes / clients to return (default: 10)' },
    },
    async (args: Record<string, unknown>) => {
      const days = (args.days as number | undefined) ?? 30;
      const limit = (args.limit as number | undefined) ?? 10;
      const [summary, topEpisodes, clients] = await Promise.all([
        podcastAnalytics.getPodcastSummary(days),
        podcastAnalytics.getTopEpisodes(limit),
        podcastAnalytics.getPodcastClients(limit),
      ]);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ summary, topEpisodes, clients }) }] };
    },
    {
      title: 'Podcast analytics',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_get_feedback',
    'Get recent listener feedback (reaction + category + note) across episodes, for podcast topic-reward and viewpoint-falsification signals. Read-only.',
    {
      days: { type: 'number', description: 'Look back this many days (default: 7). Ignored if `since` is given.' },
      since: { type: 'number', description: 'Unix epoch seconds; return feedback created at or after this time.' },
      episodeId: { type: 'string', description: 'Filter to a single episode id.' },
      limit: { type: 'number', min: 1, max: 1000, description: 'Max rows (default: 200, max: 1000).' },
    },
    async (args: Record<string, unknown>) => {
      const days = (args.days as number | undefined) ?? 7;
      const since = (args.since as number | undefined)
        ?? Math.floor(Date.now() / 1000) - days * 86400;
      const rows = await feedbackService.listFeedbackSince(since, {
        episodeId: args.episodeId as string | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows) }] };
    },
    {
      title: 'Get listener feedback',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_create_episode',
    'Create or update a podcast episode. Only idempotent when both externalSource and externalId are given — that combination upserts by external id and is safe for automated re-delivery. Without them, every call creates a new episode.',
    {
      podcastId: { type: 'string', required: true, description: 'Podcast show ID' },
      title: { type: 'string', required: true, description: 'Episode title' },
      audioUrl: { type: 'string', description: 'URL of the audio file. Required when creating a new episode; may be omitted when updating an existing one via the externalSource+externalId upsert.' },
      audioSize: { type: 'number', description: 'Audio file size in bytes' },
      duration: { type: 'number', description: 'Duration in seconds' },
      summary: { type: 'string', description: 'Short summary' },
      showNotes: { type: 'string', description: 'Full show notes (Markdown)' },
      episodeNumber: { type: 'number', description: 'Episode number' },
      seasonNumber: { type: 'number', description: 'Season number' },
      coverImage: { type: 'string', description: 'Episode cover image URL' },
      transcript: { type: 'string', description: 'Transcript text' },
      episodeType: { type: 'string', enum: ['full', 'trailer', 'bonus'], description: 'Episode type: full, trailer, or bonus' },
      explicit: { type: 'boolean', description: 'Explicit content flag. Accepts true/false (also accepts legacy 1/0).' },
      publishedAt: { type: 'number', description: 'Publish date as a unix epoch (seconds)' },
      audioType: { type: 'string', description: 'Audio MIME type, e.g. audio/mpeg, audio/wav, audio/mp4 (defaults to audio/mpeg)' },
      externalSource: { type: 'string', description: 'External source identifier (e.g. "adam"). Give this together with externalId to make the call an idempotent upsert.' },
      externalId: { type: 'string', description: 'External episode ID. Give this together with externalSource to make the call an idempotent upsert — safe to retry.' },
      slug: { type: 'string', description: 'URL slug (auto-generated if not provided)' },
    },
    async (args: Record<string, unknown>) => {
      const podcastId = args.podcastId as string;
      const data = {
        title: args.title as string,
        audioUrl: args.audioUrl as string,
        audioSize: args.audioSize as number | undefined,
        duration: args.duration as number | undefined,
        summary: args.summary as string | undefined,
        showNotes: args.showNotes as string | undefined,
        episodeNumber: args.episodeNumber as number | undefined,
        seasonNumber: args.seasonNumber as number | undefined,
        coverImage: args.coverImage as string | undefined,
        transcript: args.transcript as string | undefined,
        episodeType: args.episodeType as string | undefined,
        explicit: args.explicit === undefined ? undefined : (args.explicit ? 1 : 0),
        publishedAt: args.publishedAt as number | undefined,
        audioType: args.audioType as string | undefined,
        externalSource: args.externalSource as string | undefined,
        externalId: args.externalId as string | undefined,
        slug: args.slug as string | undefined,
      };
      if (data.externalSource && data.externalId) {
        const result = await episodeService.upsertEpisodeByExternal(podcastId, {
          ...data,
          externalSource: data.externalSource,
          externalId: data.externalId,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      }
      const episode = await episodeService.createEpisode(podcastId, data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode) }] };
    },
    {
      title: 'Create or update podcast episode',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_publish_episode',
    'Publish a podcast episode so it appears in the RSS feed and on the site',
    {
      id: { type: 'string', required: true, description: 'Episode ID' },
    },
    async (args: { id: string }) => {
      const episode = await episodeService.publishEpisode(args.id);
      if (!episode) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      // Mirror the REST route (routes/podcasts.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode) }] };
    },
    {
      title: 'Publish podcast episode',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_delete_episode',
    'Delete a podcast episode. Rebuilds the static site only if the episode was previously published (so the live episode page and RSS feed entry are removed).',
    {
      id: { type: 'string', required: true, description: 'Episode ID.' },
    },
    async (args: Record<string, unknown>) => {
      const deleted = await episodeService.deleteEpisode(args.id as string);
      if (!deleted) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      if (deleted.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete podcast episode',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_update_show',
    "Update a podcast show's metadata (title/description/slug/author/owner/category/cover/etc.). Triggers a site rebuild.",
    {
      id: { type: 'string', required: true, description: 'Podcast show ID' },
      title: { type: 'string', description: 'Show title' },
      description: { type: 'string', description: 'Show description' },
      slug: { type: 'string', description: 'URL slug' },
      author: { type: 'string', description: 'Author name' },
      ownerName: { type: 'string', description: 'Owner name for iTunes feed' },
      ownerEmail: { type: 'string', description: 'Owner email for iTunes feed' },
      category: { type: 'string', description: 'iTunes category' },
      coverImage: { type: 'string', description: 'Cover image URL' },
      language: { type: 'string', description: 'Language code (e.g. zh-CN)' },
      copyright: { type: 'string', description: 'Copyright line' },
      link: { type: 'string', description: 'Show website link' },
      appleUrl: { type: 'string', description: 'Apple Podcasts show URL' },
      spotifyUrl: { type: 'string', description: 'Spotify show URL' },
      explicit: { type: 'boolean', description: 'Explicit content flag. Accepts true/false (also accepts legacy 1/0).' },
      status: { type: 'string', enum: ['draft', 'published'], description: 'Status: draft or published' },
    },
    async (args: Record<string, unknown>) => {
      const show = await podcastService.updatePodcast(args.id as string, {
        title: args.title as string | undefined,
        description: args.description as string | undefined,
        slug: args.slug as string | undefined,
        author: args.author as string | undefined,
        ownerName: args.ownerName as string | undefined,
        ownerEmail: args.ownerEmail as string | undefined,
        category: args.category as string | undefined,
        coverImage: args.coverImage as string | undefined,
        language: args.language as string | undefined,
        copyright: args.copyright as string | undefined,
        link: args.link as string | undefined,
        appleUrl: args.appleUrl as string | undefined,
        spotifyUrl: args.spotifyUrl as string | undefined,
        explicit: args.explicit === undefined ? undefined : (args.explicit ? 1 : 0),
        status: args.status as string | undefined,
      });
      if (!show) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(show) }] };
    },
    {
      title: 'Update podcast show',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_update_episode',
    'Update a podcast episode (title/summary/show notes/transcript/episode number/type/publishedAt/etc.). Rebuilds the site when the episode is published.',
    {
      id: { type: 'string', required: true, description: 'Episode ID' },
      title: { type: 'string', description: 'Episode title' },
      summary: { type: 'string', description: 'Short summary' },
      showNotes: { type: 'string', description: 'Full show notes (HTML or Markdown)' },
      transcript: { type: 'string', description: 'Transcript text' },
      episodeNumber: { type: 'number', description: 'Episode number' },
      seasonNumber: { type: 'number', description: 'Season number' },
      episodeType: { type: 'string', enum: ['full', 'trailer', 'bonus'], description: 'Episode type: full, trailer, or bonus' },
      explicit: { type: 'boolean', description: 'Explicit content flag. Accepts true/false (also accepts legacy 1/0).' },
      duration: { type: 'number', description: 'Duration in seconds' },
      coverImage: { type: 'string', description: 'Episode cover image URL' },
      publishedAt: { type: 'number', description: 'Publish date as a unix epoch (seconds)' },
      status: { type: 'string', enum: ['draft', 'published'], description: 'Status: draft or published' },
    },
    async (args: Record<string, unknown>) => {
      const episode = await episodeService.updateEpisode(args.id as string, {
        title: args.title as string | undefined,
        summary: args.summary as string | undefined,
        showNotes: args.showNotes as string | undefined,
        transcript: args.transcript as string | undefined,
        episodeNumber: args.episodeNumber as number | undefined,
        seasonNumber: args.seasonNumber as number | undefined,
        episodeType: args.episodeType as string | undefined,
        explicit: args.explicit === undefined ? undefined : (args.explicit ? 1 : 0),
        duration: args.duration as number | undefined,
        coverImage: args.coverImage as string | undefined,
        publishedAt: args.publishedAt as number | undefined,
        status: args.status as string | undefined,
      });
      if (!episode) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      // Only a published episode is visible in the feed/site, so only then rebuild.
      if (episode.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode) }] };
    },
    {
      title: 'Update podcast episode',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'podcast_import_feed',
    'Import an external podcast RSS feed (e.g. Anchor/Spotify): upserts every episode (idempotent by guid), keeping the original audio URLs and publish dates. Episodes import as draft unless status=published. When importing into an EXISTING show, the show\'s own metadata (title/cover/owner/etc.) is left untouched unless syncShow=true.',
    {
      feedUrl: { type: 'string', required: true, description: 'URL of the external RSS feed' },
      podcastId: { type: 'string', description: 'Target show ID to import into; if omitted, a new show is created from the feed' },
      externalSource: { type: 'string', description: 'Label stored on each episode for idempotent re-import (default: rss)' },
      status: { type: 'string', enum: ['draft', 'published'], description: 'Status to import episodes as: draft (default) or published' },
      syncShow: { type: 'boolean', description: 'When importing into an existing show, set true to also overwrite the show metadata from the feed (cover, owner, category, ...). Default false = episodes only.' },
    },
    async (args: Record<string, unknown>) => {
      const feedUrl = args.feedUrl as string;
      const externalSource = (args.externalSource as string) || 'rss';
      const status = (args.status as string) || 'draft';
      const syncShow = Boolean(args.syncShow);
      let xml: string;
      try {
        const resp = await safeFetch(feedUrl);
        if (!resp.ok) {
          return { content: [{ type: 'text' as const, text: `Fetch failed: ${resp.status} ${resp.statusText}` }], isError: true };
        }
        xml = await resp.text();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'fetch error';
        return { content: [{ type: 'text' as const, text: `Fetch failed: ${message}` }], isError: true };
      }

      const { show, episodes } = feedImportService.parseExternalFeed(xml);

      let podcastId = args.podcastId as string | undefined;
      if (podcastId) {
        // Importing into an existing show: by default touch ONLY episodes, so a
        // deliberately-chosen cover/owner/title is never clobbered by the feed.
        const target = await podcastService.getPodcast(podcastId);
        if (!target) return { content: [{ type: 'text' as const, text: 'Target podcast not found' }], isError: true };
        podcastId = target.id;
        if (syncShow) await podcastService.updatePodcast(podcastId, { ...show });
      } else {
        const created = await podcastService.createPodcast({ ...show, title: show.title || 'Imported Podcast' });
        podcastId = created.id;
      }

      let createdCount = 0;
      let updatedCount = 0;
      for (const ep of episodes) {
        const { created } = await episodeService.upsertEpisodeByExternal(podcastId, {
          ...ep,
          guid: ep.guid,
          externalSource,
          externalId: ep.guid,
          status,
        });
        created ? createdCount++ : updatedCount++;
      }

      if (status === 'published') buildService.triggerBuild();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ showId: podcastId, created: createdCount, updated: updatedCount, total: episodes.length }) }],
      };
    },
    {
      title: 'Import podcast RSS feed',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }
  );

  server.tool(
    'podcast_upload_audio_from_url',
    'Fetch an audio file from a URL on the server and store it in the media library (avoids passing base64 through the client). Returns the hosted URL.',
    {
      url: { type: 'string', required: true, description: 'Public URL of the audio file to fetch' },
      filename: { type: 'string', description: 'Filename to store as (default: derived from the URL)' },
      mimeType: { type: 'string', description: 'MIME type override (default: from the response Content-Type)' },
    },
    async (args: Record<string, unknown>) => {
      const url = args.url as string;
      try {
        const resp = await safeFetch(url);
        if (!resp.ok) {
          return { content: [{ type: 'text' as const, text: `Fetch failed: ${resp.status} ${resp.statusText}` }], isError: true };
        }
        const buffer = Buffer.from(await resp.arrayBuffer());
        const filename = (args.filename as string) || url.split('/').pop()?.split('?')[0] || 'audio.mp3';
        const mimeType = ((args.mimeType as string) || resp.headers.get('content-type') || 'audio/mpeg').split(';')[0].trim();
        const result = await episodeService.uploadEpisodeAudio({
          filename,
          base64: buffer.toString('base64'),
          mimeType,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Upload podcast audio from URL',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }
  );

  // App tools
  server.tool(
    'app_list',
    'List iOS app landing pages, optionally filtered by status',
    {
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description: "Filter by status. 用户说『看已发布的 app』时用 published,『看草稿』用 draft. Example: status: 'published'.",
      },
      page: { type: 'number', min: 1, description: 'Page number, 1-based (default: 1).' },
      limit: { type: 'number', min: 1, max: 100, description: 'Items per page (default: 20, max 100).' },
    },
    async (args: Record<string, unknown>) => {
      const result = await appService.listApps({
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'List apps',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'app_get',
    'Get a single iOS app landing page by ID or slug.',
    {
      idOrSlug: { type: 'string', required: true, description: "App ID or slug. Example: idOrSlug: 'delphi'." },
    },
    async (args: Record<string, unknown>) => {
      const app = await appService.getApp(args.idOrSlug as string);
      if (!app) return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(app) }] };
    },
    {
      title: 'Get app',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'app_create',
    'Create a new iOS app landing page with name, description, features, and App Store info',
    {
      name: { type: 'string', required: true, description: "App name. Example: name: 'Delphi'." },
      tagline: { type: 'string', description: 'Short tagline shown under the app name.' },
      description: { type: 'string', description: 'Full description.' },
      appStoreUrl: { type: 'string', description: 'App Store URL.' },
      appStoreId: { type: 'string', description: 'App Store numeric ID.' },
      bundleId: { type: 'string', description: 'Bundle identifier, e.g. com.example.app.' },
      platform: { type: 'string', description: "Platform (default: 'iOS')." },
      features: {
        type: 'array',
        description:
          "Feature bullets shown on the landing page. 用户说『给它加三个卖点』时,每条卖点是一个 {icon, title, blurb} 对象. Example: [{ icon: '⚡', title: 'Fast', blurb: 'Starts in under a second.' }].",
        items: appFeatureItemSchema,
      },
      screenshots: { type: 'array', items: 'string', description: 'Screenshot URLs, in display order.' },
      links: {
        type: 'object',
        description:
          "Additional links keyed by label, e.g. { website: 'https://...', support: 'https://...' }. Free-form: any key/value pair is kept as-is.",
      },
      accentColor: { type: 'string', description: 'Accent color hex code, e.g. #5B8DEF.' },
      icon: { type: 'string', description: 'App icon URL.' },
      slug: { type: 'string', description: 'URL slug (auto-generated from name if not provided).' },
    },
    async (args: Record<string, unknown>) => {
      const app = await appService.createApp({
        name: args.name as string,
        tagline: args.tagline as string | undefined,
        description: args.description as string | undefined,
        appStoreUrl: args.appStoreUrl as string | undefined,
        appStoreId: args.appStoreId as string | undefined,
        bundleId: args.bundleId as string | undefined,
        platform: args.platform as string | undefined,
        features: args.features === undefined ? undefined : JSON.stringify(args.features),
        screenshots: args.screenshots === undefined ? undefined : JSON.stringify(args.screenshots),
        links: args.links === undefined ? undefined : JSON.stringify(args.links),
        accentColor: args.accentColor as string | undefined,
        icon: args.icon as string | undefined,
        slug: args.slug as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(app) }] };
    },
    {
      title: 'Create app landing page',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'app_publish',
    'Publish an app landing page so it appears on the public site',
    {
      id: { type: 'string', required: true, description: "App ID (get it from app_list or app_create). Example: id: 'app_abc123'." },
    },
    async (args: { id: string }) => {
      const app = await appService.publishApp(args.id);
      if (!app) return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      // Mirror the REST route (routes/apps.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(app) }] };
    },
    {
      title: 'Publish app landing page',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  server.tool(
    'app_update',
    "Update an app's editorial display info (tagline/features/accentColor/links/sortOrder/status/...). NOTE: description, screenshots, and icon are managed by app_sync (synced from the App Store) and are NOT editable here — editing them would be reverted on the next sync. After editing, run the build-trigger tool to render on /apps/:slug.",
    {
      id: { type: 'string', required: true, description: "App ID (get it from app_list). Example: id: 'app_abc123'." },
      name: { type: 'string', description: 'App name.' },
      slug: { type: 'string', description: 'URL slug.' },
      tagline: { type: 'string', description: "Short tagline. 用户说『改一下标语』时用这个. Example: tagline: 'Your ideas, organized.'." },
      accentColor: { type: 'string', description: 'Accent color hex code, e.g. #5B8DEF.' },
      features: {
        type: 'array',
        description:
          "Feature bullets shown on the landing page. 传了就是整组替换,不是追加. 用户说『给它加三个卖点』『把卖点改成……』时用这个,并且要带上想保留的旧卖点. Example: [{ icon: '⚡', title: 'Fast', blurb: 'Starts in under a second.' }].",
        items: appFeatureItemSchema,
      },
      links: {
        type: 'object',
        description:
          "Additional links keyed by label, e.g. { website: 'https://...', support: 'https://...' }. 传了就是整组替换,不是追加. Free-form: any key/value pair is kept as-is.",
      },
      sortOrder: { type: 'number', description: 'Sort order among app listings (lower shows first).' },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description: "用户说『下架这个 app』时用 draft,『上线/发布』用 published. Example: status: 'published'.",
      },
      meta: { type: 'string', description: 'JSON metadata string.' },
    },
    async (args: Record<string, unknown>) => {
      const app = await appService.updateApp(args.id as string, {
        name: args.name as string | undefined,
        slug: args.slug as string | undefined,
        tagline: args.tagline as string | undefined,
        accentColor: args.accentColor as string | undefined,
        features: args.features === undefined ? undefined : JSON.stringify(args.features),
        links: args.links === undefined ? undefined : JSON.stringify(args.links),
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: args.meta as string | undefined,
      });
      if (!app) {
        return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(app) }] };
    },
    {
      title: 'Update app landing page',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'app_delete',
    'Delete an app landing page. Rebuilds the static site only if the app was previously published (so the live /apps/:slug page is removed).',
    {
      id: { type: 'string', required: true, description: "App ID (get it from app_list). Example: id: 'app_abc123'." },
    },
    async (args: Record<string, unknown>) => {
      const deleted = await appService.deleteApp(args.id as string);
      if (!deleted) return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      if (deleted.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete app',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'app_discover',
    'Discover apps from App Store Connect and create draft rows for new ones (idempotent; no sync, no publish, no ASC writeback).',
    {},
    async () => {
      try {
        const result = await appService.discoverApps();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Discovery failed';
        if (message.includes('ASC_NOT_CONFIGURED') || message.includes('ASC not configured')) {
          return { content: [{ type: 'text' as const, text: 'ASC not configured' }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Discovery failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Discover apps from App Store Connect',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }
  );

  // App sync tools
  server.tool(
    'app_sync',
    "Sync app metadata from the App Store (version/category/screenshots/rating/icon) via iTunes Lookup + App Store Connect, then rebuild the site if anything changed. Give `id` to sync ONE app; OMIT `id` to sync EVERY app that has an App Store ID. Returns the fields that actually changed per app — an empty `fields` list means the fetch succeeded and nothing differed, which is a normal outcome, not a failure.",
    {
      id: {
        type: 'string',
        description:
          "App ID to sync. OMIT this to sync all apps instead. 用户说『同步一下 Delphi』时传它对应的 id;说『同步所有 app』/『刷新 App Store 数据』时不要传. Example: id: 'app_abc123'.",
      },
    },
    async (args: Record<string, unknown>) => {
      const id = args.id as string | undefined;
      try {
        // `/apps/*` is static Astro output, so a DB-only sync is invisible on the
        // live site. The repo rule is that the ADAPTER owns the build hook (the
        // service stays side-effect free) — REST's POST /apps/:id/sync already
        // does this; these MCP tools did not, which is why "I synced but the page
        // still shows the old version" was the #1 reported failure.
        // Rebuild only when a PUBLISHED app actually changed: an unchanged sync
        // rebuilding the whole site would make the trigger meaningless.
        let changes: Awaited<ReturnType<typeof appSyncService.syncApp>>[];
        let failed: Awaited<ReturnType<typeof appSyncService.syncAllApps>>['failed'];
        if (id) {
          changes = [await appSyncService.syncApp(id)];
          failed = [];
        } else {
          const result = await appSyncService.syncAllApps();
          changes = result.changes;
          failed = result.failed;
        }
        const rebuilt = changes.some((c) => c.status === 'published' && c.fields.length > 0);
        if (rebuilt) buildService.triggerBuild();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                scope: id ? 'one' : 'all',
                synced: changes.length,
                failed,
                changed: changes.filter((c) => c.fields.length > 0),
                unchanged: changes.filter((c) => c.fields.length === 0).map((c) => c.slug),
                // An app on no storefront cannot be installed, so a PUBLISHED
                // one is a page for something nobody can get. These always land
                // in `unchanged` (no storefront answered, so nothing to write),
                // where the slug-only shape would hide them.
                notOnAnyStorefront: changes
                  .filter((c) => c.storefront === null)
                  .map((c) => ({ slug: c.slug, status: c.status })),
                rebuildTriggered: rebuilt,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        return { content: [{ type: 'text' as const, text: `Sync failed: ${message}` }], isError: true };
      }
    },
    {
      title: 'Sync app metadata from App Store',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }
  );

  // Page tools (companion pages: privacy/terms/help/...)
  server.tool(
    'page_list',
    'List WordBase pages (companion pages: privacy/terms/help/...). Optional `status` filters; omit it to list all.',
    {
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description: "Filter by status. 用户说『看已发布的页面』时用 published,『看草稿』用 draft(omit for all). Example: status: 'published'.",
      },
    },
    async (args: Record<string, unknown>) => {
      const pages = await pageService.listPages({ status: args.status as string | undefined });
      return { content: [{ type: 'text' as const, text: JSON.stringify(pages) }] };
    },
    {
      title: 'List pages',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'page_get',
    'Get a single companion page by ID or slug',
    {
      idOrSlug: { type: 'string', required: true, description: "Page ID or slug. Example: idOrSlug: 'delphi-privacy'." },
    },
    async (args: Record<string, unknown>) => {
      const page = await pageService.getPage(args.idOrSlug as string);
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(page) }] };
    },
    {
      title: 'Get page',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'page_create',
    "Create a companion page for an app (privacy / terms / support). CONVENTION — you are expected to be calling this from inside the app's own project, so name the page after THAT project, not after the App Store listing: slug = `<project-slug>-<type>`, where <project-slug> is the project/repo name lowercased (e.g. project CleanLabel → `cleanlabel-privacy`, `cleanlabel-terms`, `cleanlabel-support`) and <type> is one of privacy | terms | support. Do NOT derive the slug from the App Store display name — that name changes for ASO reasons and the page URL must stay stable (it is submitted to App Store Connect as the app's Support/Privacy URL). App Store Connect requires a Support URL and a Privacy Policy URL for every app, so privacy + support are the minimum pair. Recommended: also pass `app` so meta.appId records which app this page belongs to — WordBase does not enforce or infer the association, the calling project owns it. BILINGUAL — `/en/<slug>` is NOT an English edition you author. It is this site's own translation-memory rendition of the same Chinese source, and where no rendition exists the English shell renders the Chinese body verbatim; only blocks a human reviewed via `i18n_put_cache` are real English. (`/en/apps/*` is the opposite case and the reason this gets confused: there the English comes from the App Store listing itself, via meta.i18n.en.) HARD RULE — submit the bare `https://norvyn.com/<slug>` to App Store Connect, never an `/en/` URL, in any locale.",
    {
      title: { type: 'string', required: true, description: "Page title. Example: title: 'Privacy Policy'." },
      content: { type: 'string', required: true, description: "Page content in Markdown. Example: content: '# Privacy Policy\\n\\n...'." },
      slug: { type: 'string', description: "URL slug. Convention: `<project-slug>-<type>` from the CALLING PROJECT's name (lowercased), type ∈ privacy|terms|support. Example: slug: 'cleanlabel-support'. Keep it stable once submitted to App Store Connect. The URL you submit there is `https://norvyn.com/<slug>` — never the `/en/<slug>` twin, which is a machine rendition of the same source." },
      sortOrder: { type: 'number', description: 'Sort order (default: 0).' },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description: "用户说『先存草稿』时用 draft(默认);说『直接发布』时用 published. Example: status: 'draft'.",
      },
      meta: {
        type: 'object',
        description: 'Structured metadata object, e.g. { appId: "delphi" }. Merged with the app arg below, not replaced by it.',
      },
      app: { type: 'string', description: "App slug to associate this page with (stamps meta.appId). Example: app: 'delphi'." },
    },
    async (args: Record<string, unknown>) => {
      // `meta` arrives as a structured object via the compiled schema, but the
      // hand-rolled tests in mcp.tools.test.ts call this handler directly
      // (bypassing Zod) with a raw JSON string to exercise the "malformed
      // meta" error path — accept both shapes.
      let metaObj: Record<string, unknown> | undefined;
      if (args.meta !== undefined) {
        if (typeof args.meta === 'string') {
          try {
            const parsed = JSON.parse(args.meta);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object' }], isError: true };
            }
            metaObj = parsed as Record<string, unknown>;
          } catch {
            return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object' }], isError: true };
          }
        } else if (typeof args.meta === 'object' && !Array.isArray(args.meta)) {
          metaObj = args.meta as Record<string, unknown>;
        } else {
          return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object' }], isError: true };
        }
      }
      if (args.app) {
        metaObj = { ...(metaObj ?? {}), appId: args.app as string };
      }
      const page = await pageService.createPage({
        title: args.title as string,
        content: args.content as string,
        slug: args.slug as string | undefined,
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: metaObj === undefined ? undefined : JSON.stringify(metaObj),
      });
      // Mirror routes/pages.ts: a page created published rebuilds the site.
      if (page.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(page) }] };
    },
    {
      title: 'Create page',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'page_update',
    "Update a companion page's title, content, or status",
    {
      id: { type: 'string', required: true, description: 'Page ID.' },
      title: { type: 'string', description: 'Page title.' },
      slug: { type: 'string', description: "URL slug. Changing it changes the public URL — if this page's URL was submitted to App Store Connect, keep it stable. The URL submitted there is always the bare `https://norvyn.com/<slug>`, never the `/en/<slug>` twin (that one is this site's translation-memory rendition of the same source, not an English localization)." },
      content: { type: 'string', description: 'Page content in Markdown.' },
      sortOrder: { type: 'number', description: 'Sort order.' },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        description: "用户说『下架这个页面』时用 draft,『发布/上线』用 published. Example: status: 'published'.",
      },
      meta: { type: 'object', description: '传了就是整个替换,不是合并. Structured metadata object, e.g. { appId: "delphi" }.' },
    },
    async (args: Record<string, unknown>) => {
      // Same string-or-object tolerance as page_create — see comment there.
      let metaStr: string | undefined;
      if (args.meta !== undefined) {
        if (typeof args.meta === 'string') {
          metaStr = args.meta;
        } else if (typeof args.meta === 'object' && !Array.isArray(args.meta)) {
          metaStr = JSON.stringify(args.meta);
        } else {
          return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object' }], isError: true };
        }
      }
      const before = await pageService.getPage(args.id as string);
      const page = await pageService.updatePage(args.id as string, {
        title: args.title as string | undefined,
        slug: args.slug as string | undefined,
        content: args.content as string | undefined,
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: metaStr,
      });
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      // Rebuild whenever the change touches the public site: still published, OR
      // it was published and is now unpublished (so the site drops it). Mirrors
      // the REST PUT route's before/after check.
      if (page.status === 'published' || before?.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(page) }] };
    },
    {
      title: 'Update page',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'page_delete',
    'Delete a companion page (privacy/terms/help/...) by ID',
    {
      id: { type: 'string', required: true, description: 'Page ID.' },
    },
    async (args: Record<string, unknown>) => {
      const deleted = await pageService.deletePage(args.id as string);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      // The returned row carries its pre-delete status; deleting a published page
      // must drop it from the static site (mirror routes/pages.ts).
      if (deleted.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }) }] };
    },
    {
      title: 'Delete page',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'page_publish',
    "Publish a companion page (sets status=published) and rebuilds the static site so it renders at its public URL. That URL is `https://norvyn.com/<slug>`, and it is the one to submit to App Store Connect — never the `/en/<slug>` twin, which is this site's translation-memory rendition of the same Chinese source (it falls back to the Chinese body when no rendition exists) and not an English localization you authored.",
    {
      id: { type: 'string', required: true, description: 'Page ID.' },
    },
    async (args: Record<string, unknown>) => {
      const page = await pageService.publishPage(args.id as string);
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      // Mirror the REST route (routes/pages.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(page) }] };
    },
    {
      title: 'Publish page',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  // Post meta tool
  server.tool(
    'post_update_meta',
    'Update SEO metadata for a post (og:title, og:description, og:image)',
    {
      id: { type: 'string', required: true, description: 'Post ID.' },
      description: {
        type: 'string',
        description:
          "Meta description / og:description. 用户说『改一下这篇的 SEO 描述』时用这个. Example: description: '一篇讲 RSS 原理的入门文章'.",
      },
      ogTitle: { type: 'string', description: "og:title (defaults to post title). Example: ogTitle: 'RSS 入门指南'." },
      ogImage: { type: 'string', description: "og:image URL. Example: ogImage: 'https://norvyn.com/media/cover.png'." },
    },
    async (args: Record<string, unknown>) => {
      const post = await postService.getPost(args.id as string);
      if (!post) return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };

      const existingMeta = post.meta ? JSON.parse(post.meta) : {};
      const newMeta = { ...existingMeta };
      if (args.description) newMeta.description = args.description;
      if (args.ogTitle) newMeta.og_title = args.ogTitle;
      if (args.ogImage) newMeta.og_image = args.ogImage;

      const updated = await postService.updatePost(args.id as string, { meta: JSON.stringify(newMeta) });
      return { content: [{ type: 'text' as const, text: JSON.stringify(updated) }] };
    },
    {
      title: 'Update post SEO metadata',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // i18n tools — entity-aware render/pending/cache. REST and MCP share the
  // same i18n-content.service so source-unit policy lives in one place.
  server.tool(
    'i18n_render',
    'Render a published entity field in `lang` using the i18n cache. Unpublished entities, unknown ids, and unsupported (type, field) pairs return isError (no auth required for the underlying REST route, but MCP requires i18n:read).',
    {
      type: {
        type: 'string',
        required: true,
        enum: ['post', 'page', 'app'],
        description: "Entity type. Example: type: 'page'.",
      },
      id: { type: 'string', required: true, description: "Entity ID or slug. Example: id: 'delphi-privacy'." },
      field: {
        type: 'string',
        required: true,
        enum: ['content', 'title', 'tagline', 'features'],
        description: 'Field to render: content (post/page markdown), title (post/page), tagline or features (app).',
      },
      lang: { type: 'string', description: 'Target language code (e.g. en, ja). Empty / "zh" returns the source.' },
    },
    async (args: Record<string, unknown>) => {
      const type = args.type as string | undefined;
      const id = args.id as string | undefined;
      const field = args.field as string | undefined;
      // Kept as defense-in-depth: the enum above already rejects unknown
      // type/field at the schema level for real MCP calls, but every MCP
      // unit test in this repo calls handlers directly (bypassing Zod).
      if (type !== 'post' && type !== 'page' && type !== 'app') {
        return { content: [{ type: 'text' as const, text: 'Unsupported type' }], isError: true };
      }
      if (field !== 'content' && field !== 'title' && field !== 'tagline' && field !== 'features') {
        return { content: [{ type: 'text' as const, text: 'Unsupported field' }], isError: true };
      }
      if (!id) {
        return { content: [{ type: 'text' as const, text: 'id is required' }], isError: true };
      }
      const result = await i18nContent.renderEntityField(
        type,
        id,
        field,
        (args.lang as string) ?? ''
      );
      if (!result) {
        return { content: [{ type: 'text' as const, text: 'Not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'Render translated entity field',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'i18n_pending',
    'List translatable source units (across all published posts/pages/apps) that have no cache row for `lang`. Each item is { hash, text, ref }. Ref format: "type:id:field" (or "type:id:features.title|blurb").',
    {
      lang: { type: 'string', required: true, description: "Target language code (e.g. en, ja). Example: lang: 'en'." },
    },
    async (args: Record<string, unknown>) => {
      const lang = args.lang as string | undefined;
      if (!lang) {
        return { content: [{ type: 'text' as const, text: 'lang is required' }], isError: true };
      }
      const units = await i18nContent.listPendingUnits(lang);
      return { content: [{ type: 'text' as const, text: JSON.stringify(units) }] };
    },
    {
      title: 'List pending translation units',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'i18n_put_cache',
    'Write translation entries to the i18n cache. Each entry is { sourceHash, lang, text, model, humanEdited }. Preserves the human_edited guard (AI writes cannot overwrite a human row). 用户说『把这批翻译灌进去』时用这个:先用 i18n_pending 拿到每条的 hash,再逐条给出翻译文本. Pass a structured array (a JSON-encoded string of the same array is also accepted for backward compatibility).',
    {
      entries: {
        type: 'array',
        required: true,
        items: i18nEntryItemSchema,
        description:
          "Translation entries. Example: [{ sourceHash: 'h1', lang: 'en', text: '[en] heading', model: 'claude', humanEdited: false }].",
      },
    },
    async (args: Record<string, unknown>) => {
      // Zod already validates `entries` into an array of well-shaped objects
      // for real MCP calls. These checks stay as defense-in-depth for the
      // tool() fallback path (doubles without registerTool bypass Zod
      // entirely) and for the legacy JSON-encoded-string calling shape.
      if (args.entries === undefined) {
        return { content: [{ type: 'text' as const, text: 'entries is required' }], isError: true };
      }
      let entries: unknown = args.entries;
      if (typeof entries === 'string') {
        try {
          entries = JSON.parse(entries);
        } catch {
          return { content: [{ type: 'text' as const, text: 'entries is not valid JSON' }], isError: true };
        }
      }
      if (!Array.isArray(entries)) {
        return { content: [{ type: 'text' as const, text: 'entries must be an array' }], isError: true };
      }
      const result = await i18nContent.putTranslations(entries as Parameters<typeof i18nContent.putTranslations>[0]);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'Write translation cache entries',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }
  );

  // Site identity tools (Task 12, DP-002 = A). GET /api/settings/site is public
  // over REST (no anonymous concept in MCP, same reasoning as i18n_render
  // above); there is no REST PUT /site — settings_update_site is a thin
  // wrapper over settingsService.updateSettings that only writes the five
  // site-identity keys (see SITE_IDENTITY_SETTINGS_KEYS in site.service.ts).
  server.tool(
    'settings_get_site',
    'Get the resolved site identity (name/description/author/email/github) shown in nav, footer, RSS, and llms.txt meta. This is a defaults+settings overlay view, not the raw settings map.',
    {},
    async () => {
      const identity = await siteService.getSiteIdentity();
      return { content: [{ type: 'text' as const, text: JSON.stringify(identity) }] };
    },
    {
      title: 'Get site identity',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );

  server.tool(
    'settings_update_site',
    'Update site identity fields (name/description/author/email/github) shown in nav, footer, RSS, and llms.txt meta. Only writes these five whitelisted keys, not the rest of the settings map. Rebuilds the static site (site identity is baked into every page\'s meta). Known quirk: a legacy placeholder value ("Wordbase Blog" / "A personal blog") is silently replaced by the default on read, so the value read back after writing may differ from what you wrote.',
    {
      name: { type: 'string', description: "Site name. Example: name: 'norvyn'." },
      description: { type: 'string', description: 'Site tagline/description — drives RSS, llms.txt, and Organization JSON-LD.' },
      author: { type: 'string', description: 'Site author name.' },
      email: { type: 'string', description: 'Contact email shown in footer/About.' },
      github: { type: 'string', description: 'GitHub profile URL.' },
    },
    async (args: Record<string, unknown>) => {
      const data: Record<string, string> = {};
      for (const field of Object.keys(siteService.SITE_IDENTITY_SETTINGS_KEYS) as Array<keyof typeof siteService.SITE_IDENTITY_SETTINGS_KEYS>) {
        const value = args[field];
        if (typeof value === 'string') {
          data[siteService.SITE_IDENTITY_SETTINGS_KEYS[field]] = value;
        }
      }
      if (Object.keys(data).length === 0) {
        return { content: [{ type: 'text' as const, text: 'No site identity fields provided (name/description/author/email/github)' }], isError: true };
      }
      await settingsService.updateSettings(data);
      // Site identity is baked into every page's meta (nav/footer/RSS/llms.txt).
      buildService.triggerBuild();
      const identity = await siteService.getSiteIdentity();
      return { content: [{ type: 'text' as const, text: JSON.stringify(identity) }] };
    },
    {
      title: 'Update site identity',
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }
  );

  // Observability tools (Task 12, DP-002 = A). `section` mirrors one GET under
  // /api/observability/* — 16 of its 17 endpoints; top-posts is intentionally
  // excluded (same data is already served by analytics_query's top_posts
  // section, both via analyticsService.getTopPosts, so including it here would
  // just be a second path to the same numbers).
  server.tool(
    'observability_query',
    "Query observability data: visitor analytics (visits/trends/top-pages/referrers/shares/regions/devices), content stats, request metrics, system status, SEO health, and podcast consumption analytics (podcast-summary/trends/top-episodes/episodes/clients). `section` selects which one to return.",
    {
      section: {
        type: 'string',
        required: true,
        enum: [
          'visits', 'trends', 'top-pages', 'referrers', 'shares', 'regions', 'devices',
          'content', 'requests', 'system', 'seo-health',
          'podcast-summary', 'podcast-trends', 'podcast-top-episodes', 'podcast-episodes', 'podcast-clients',
        ],
        description:
          "Which section to query. 用户问『上周哪些国家来的人多』用 regions;『流量趋势』用 trends;『播客下载』用 podcast-summary. Example: section: 'regions'.",
      },
      days: { type: 'number', min: 1, max: 365, description: 'Window in days, for sections that support it (default varies by section; ignored otherwise).' },
      limit: { type: 'number', min: 1, max: 50, description: 'Max rows to return, for sections that support it (default varies by section; ignored otherwise).' },
    },
    async (args: Record<string, unknown>) => {
      const section = args.section as string;
      const days = args.days as number | undefined;
      const limit = args.limit as number | undefined;
      let result: unknown;
      switch (section) {
        case 'visits':
          result = await analyticsService.getVisitorSummary(days);
          break;
        case 'trends':
          result = await analyticsService.getVisitTrends('daily');
          break;
        case 'top-pages':
          result = await analyticsService.getTopPages(limit);
          break;
        case 'referrers':
          result = await analyticsService.getReferrers(limit);
          break;
        case 'shares':
          result = await analyticsService.getShareStats(days);
          break;
        case 'regions':
          result = await analyticsService.getRegions(days);
          break;
        case 'devices':
          // Service default (365) differs from the REST route's explicit
          // default (30) — mirror the REST default here for parity.
          result = await analyticsService.getDeviceBreakdown(days ?? 30);
          break;
        case 'content':
          result = await analyticsService.getContentStats();
          break;
        case 'requests':
          result = await observabilityService.getRequestMetrics();
          break;
        case 'system':
          result = observabilityService.getSystemStatus();
          break;
        case 'seo-health':
          result = seoHealthService.getSeoHealth();
          break;
        case 'podcast-summary':
          result = await podcastAnalytics.getPodcastSummary(days);
          break;
        case 'podcast-trends':
          result = await podcastAnalytics.getPodcastTrends('daily');
          break;
        case 'podcast-top-episodes':
          result = await podcastAnalytics.getTopEpisodes(limit);
          break;
        case 'podcast-episodes':
          result = await podcastAnalytics.getEpisodeDownloadTable();
          break;
        case 'podcast-clients':
          result = await podcastAnalytics.getPodcastClients(limit);
          break;
        default:
          return { content: [{ type: 'text' as const, text: `Unknown section: ${section}` }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
    {
      title: 'Query observability data',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }
  );
}
