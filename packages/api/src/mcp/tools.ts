import * as postService from '../services/post.service.js';
import * as mediaService from '../services/media.service.js';
import * as commentService from '../services/comment.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as buildService from '../services/build.service.js';
import * as redirectService from '../services/redirect.service.js';
import * as podcastService from '../services/podcast.service.js';
import * as episodeService from '../services/episode.service.js';
import * as podcastAnalytics from '../services/podcast-analytics.service.js';
import * as appService from '../services/app.service.js';
import * as appSyncService from '../services/app-sync.service.js';
import * as pageService from '../services/page.service.js';
import * as feedImportService from '../services/feed-import.service.js';
import { safeFetch } from '../lib/safe-fetch.js';
import { hasScope } from '../middleware/auth.js';
import { z, type ZodTypeAny } from 'zod';

// Each tool below declares its input schema as a plain { type, description } map.
// The MCP SDK's tool() expects a Zod raw shape (values must be Zod types); when
// it sees a non-Zod object it silently treats it as `annotations` instead — which
// is what produced the `annotations.title` validation crash on the client for the
// 5 tools that have a `title` field, and left every other tool with no advertised
// parameters. Convert each descriptor to a Zod type centrally so the tool call sites
// stay declarative.
type PropDescriptor = { type: 'string' | 'number'; description?: string };

function toZodShape(shape: Record<string, PropDescriptor>): Record<string, ZodTypeAny> {
  const out: Record<string, ZodTypeAny> = {};
  for (const [key, def] of Object.entries(shape)) {
    let zt: ZodTypeAny = def.type === 'number' ? z.number() : z.string();
    if (def.description) zt = zt.describe(def.description);
    // The original plain schemas carried no `required` list, so every field stays
    // optional to preserve behavior; requiredness can be tightened per-tool later.
    out[key] = zt.optional();
  }
  return out;
}

// Required scope per MCP tool — mirrors the REST route scopes. Before this, MCP
// tools ran with zero scope checks (#6); the wrapper below enforces them.
const TOOL_SCOPES: Record<string, string> = {
  blog_list_posts: 'posts:read',
  blog_get_post: 'posts:read',
  blog_create_post: 'posts:write',
  blog_update_post_meta: 'posts:write',
  blog_list_media: 'media:read',
  blog_upload_media: 'media:write',
  blog_delete_media: 'media:write',
  blog_list_comments: 'comments:read',
  blog_moderate_comment: 'comments:write',
  blog_reply_comment: 'comments:write',
  blog_delete_comment: 'comments:write',
  blog_analytics_overview: 'analytics:read',
  blog_analytics_top_posts: 'analytics:read',
  blog_analytics_trends: 'analytics:read',
  blog_content_stats: 'analytics:read',
  blog_trigger_build: 'build:trigger',
  blog_build_status: 'build:read',
  blog_manage_redirects: 'redirects:write',
  podcast_list_shows: 'podcasts:read',
  podcast_create_show: 'podcasts:write',
  podcast_update_show: 'podcasts:write',
  podcast_publish_show: 'podcasts:write',
  podcast_list_episodes: 'podcasts:read',
  podcast_create_episode: 'podcasts:write',
  podcast_update_episode: 'podcasts:write',
  podcast_upload_audio: 'podcasts:write',
  podcast_upload_audio_from_url: 'podcasts:write',
  podcast_publish_episode: 'podcasts:write',
  podcast_import_feed: 'podcasts:write',
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
  app_sync_all: 'apps:write',
  page_list: 'pages:read',
  page_get: 'pages:read',
  page_create: 'pages:write',
  page_update: 'pages:write',
  page_delete: 'pages:write',
  page_publish: 'pages:write',
};

export function registerTools(realServer: any, permissions: string[] = ['*']) {
  // Wrap the SDK's tool() so each registration below is gated by its TOOL_SCOPES
  // entry, without editing every call site. A tool call made with an
  // out-of-scope key returns an MCP error result instead of executing.
  const server = {
    tool(...args: any[]) {
      const name = args[0] as string;
      // Convert the plain { type, description } input-schema map (3rd positional
      // arg) into a Zod raw shape the SDK recognizes. Skip when there is no schema
      // arg, or when it is already a function (3-arg overload).
      if (args.length >= 4 && args[2] && typeof args[2] === 'object' && !Array.isArray(args[2])) {
        args[2] = toZodShape(args[2] as Record<string, PropDescriptor>);
      }
      const scope = TOOL_SCOPES[name];
      const handler = args[args.length - 1];
      if (scope && typeof handler === 'function') {
        args[args.length - 1] = (...callArgs: any[]) => {
          if (!hasScope(permissions, scope)) {
            return {
              content: [{ type: 'text' as const, text: `Permission denied: API key lacks the "${scope}" scope.` }],
              isError: true,
            };
          }
          return handler(...callArgs);
        };
      }
      return realServer.tool(...args);
    },
  };

  server.tool(
    'blog_list_posts',
    'List blog posts with optional filtering',
    {
      status: { type: 'string', description: 'Filter by status: draft, published, archived' },
      category: { type: 'string', description: 'Filter by category slug' },
      tag: { type: 'string', description: 'Filter by tag slug' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 10)' },
      search: { type: 'string', description: 'Search in post titles' },
    },
    async (args: Record<string, unknown>) => {
      const result = await postService.listPosts({
        status: args.status as string | undefined,
        category: args.category as string | undefined,
        tag: args.tag as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
        search: args.search as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'blog_get_post',
    'Get a single blog post by ID or slug',
    {
      idOrSlug: { type: 'string', description: 'Post ID or slug' },
    },
    async (args: { idOrSlug: string }) => {
      const post = await postService.getPost(args.idOrSlug);
      if (!post) {
        return { content: [{ type: 'text' as const, text: 'Post not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(post, null, 2) }] };
    }
  );

  server.tool(
    'blog_create_post',
    'Create a new blog post',
    {
      title: { type: 'string', description: 'Post title' },
      content: { type: 'string', description: 'Post content in Markdown' },
      slug: { type: 'string', description: 'URL slug (auto-generated if not provided)' },
      status: { type: 'string', description: 'Post status: draft (default) or published' },
      categoryIds: { type: 'string', description: 'Comma-separated category IDs' },
      tagIds: { type: 'string', description: 'Comma-separated tag IDs' },
    },
    async (args: Record<string, unknown>) => {
      const post = await postService.createPost({
        title: args.title as string,
        content: args.content as string,
        slug: args.slug as string | undefined,
        status: args.status as string | undefined,
        categoryIds: args.categoryIds ? (args.categoryIds as string).split(',').map(s => s.trim()) : undefined,
        tagIds: args.tagIds ? (args.tagIds as string).split(',').map(s => s.trim()) : undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(post, null, 2) }] };
    }
  );

  // Media tools
  server.tool(
    'blog_list_media',
    'List media library items',
    {
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await mediaService.listMedia({
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'blog_upload_media',
    'Upload a file to the media library (base64 encoded)',
    {
      filename: { type: 'string', description: 'Original filename' },
      content: { type: 'string', description: 'Base64 encoded file content' },
      mimeType: { type: 'string', description: 'MIME type (e.g., image/png, image/jpeg)' },
      altText: { type: 'string', description: 'Alt text for the image (optional)' },
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
        return { content: [{ type: 'text' as const, text: JSON.stringify(record, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'blog_delete_media',
    'Delete a media item',
    {
      id: { type: 'string', description: 'Media ID to delete' },
    },
    async (args: { id: string }) => {
      const deleted = await mediaService.deleteMedia(args.id);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Media not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }, null, 2) }] };
    }
  );

  // Comment tools
  server.tool(
    'blog_list_comments',
    'List comments for a blog post',
    {
      postId: { type: 'string', description: 'Post ID to list comments for' },
      status: { type: 'string', description: 'Filter by status: approved, pending, spam, trash (default: approved)' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await commentService.listComments(args.postId as string, {
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'blog_moderate_comment',
    'Moderate a comment (approve, spam, or trash)',
    {
      id: { type: 'string', description: 'Comment ID to moderate' },
      action: { type: 'string', description: 'Action: approve, spam, or trash' },
    },
    async (args: { id: string; action: string }) => {
      const statusMap: Record<string, string> = { approve: 'approved', spam: 'spam', trash: 'trash' };
      const status = statusMap[args.action];
      if (!status) {
        return { content: [{ type: 'text' as const, text: 'Invalid action. Use: approve, spam, or trash' }], isError: true };
      }
      const comment = await commentService.updateCommentStatus(args.id, status);
      if (!comment) {
        return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment, null, 2) }] };
    }
  );

  server.tool(
    'blog_reply_comment',
    'Reply to an existing comment',
    {
      postId: { type: 'string', description: 'Post ID the comment belongs to' },
      parentId: { type: 'string', description: 'Parent comment ID to reply to' },
      authorName: { type: 'string', description: 'Author name for the reply' },
      content: { type: 'string', description: 'Reply content' },
    },
    async (args: Record<string, unknown>) => {
      try {
        const comment = await commentService.createComment(args.postId as string, {
          authorName: args.authorName as string,
          content: args.content as string,
          parentId: args.parentId as string,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(comment, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create reply';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    }
  );

  server.tool(
    'blog_delete_comment',
    'Delete a comment',
    {
      id: { type: 'string', description: 'Comment ID to delete' },
    },
    async (args: { id: string }) => {
      const deleted = await commentService.deleteComment(args.id);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }, null, 2) }] };
    }
  );

  // Analytics tools
  server.tool(
    'blog_analytics_overview',
    'Get blog analytics overview (total PV, today PV, active posts)',
    {},
    async () => {
      const overview = await analyticsService.getOverview();
      return { content: [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }] };
    }
  );

  server.tool(
    'blog_analytics_top_posts',
    'Get top posts by page views',
    {
      limit: { type: 'number', description: 'Number of top posts to return (default: 10)' },
    },
    async (args: Record<string, unknown>) => {
      const topPosts = await analyticsService.getTopPosts((args.limit as number) || 10);
      return { content: [{ type: 'text' as const, text: JSON.stringify(topPosts, null, 2) }] };
    }
  );

  server.tool(
    'blog_analytics_trends',
    'Get traffic trends over time',
    {
      period: { type: 'string', description: 'Period: daily, weekly, or monthly (default: daily)' },
    },
    async (args: Record<string, unknown>) => {
      const trends = await analyticsService.getTrends((args.period as string) || 'daily');
      return { content: [{ type: 'text' as const, text: JSON.stringify(trends, null, 2) }] };
    }
  );

  server.tool(
    'blog_content_stats',
    'Get content statistics: publish frequency and tag distribution',
    {},
    async () => {
      const stats = await analyticsService.getContentStats();
      return { content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }] };
    }
  );

  // Build tools
  server.tool(
    'blog_trigger_build',
    'Trigger an Astro site rebuild',
    {},
    async () => {
      const status = await buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }] };
    }
  );

  server.tool(
    'blog_build_status',
    'Check current build status',
    {},
    async () => {
      const status = buildService.getBuildStatus();
      return { content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }] };
    }
  );

  // Redirect tools
  server.tool(
    'blog_manage_redirects',
    'List, create, or delete URL redirects',
    {
      action: { type: 'string', description: 'Action: list, create, or delete' },
      fromPath: { type: 'string', description: 'Source path (for create)' },
      toPath: { type: 'string', description: 'Target path (for create)' },
      id: { type: 'string', description: 'Redirect ID (for delete)' },
    },
    async (args: Record<string, unknown>) => {
      const action = args.action as string;
      if (action === 'list') {
        const list = await redirectService.listRedirects();
        return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
      }
      if (action === 'create') {
        const record = await redirectService.createRedirect({
          fromPath: args.fromPath as string,
          toPath: args.toPath as string,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(record, null, 2) }] };
      }
      if (action === 'delete') {
        const deleted = await redirectService.deleteRedirect(args.id as string);
        if (!deleted) return { content: [{ type: 'text' as const, text: 'Redirect not found' }], isError: true };
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] };
      }
      return { content: [{ type: 'text' as const, text: 'Invalid action. Use: list, create, or delete' }], isError: true };
    }
  );

  // Podcast tools
  server.tool(
    'podcast_list_shows',
    'List all podcast shows, optionally filtered by status',
    {
      status: { type: 'string', description: 'Filter by status: draft or published' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await podcastService.listPodcasts({
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'podcast_create_show',
    'Create a new podcast show with title, description, and owner info',
    {
      title: { type: 'string', description: 'Show title' },
      description: { type: 'string', description: 'Show description' },
      ownerEmail: { type: 'string', description: 'Owner email for iTunes feed' },
      ownerName: { type: 'string', description: 'Owner name for iTunes feed' },
      author: { type: 'string', description: 'Author name' },
      language: { type: 'string', description: 'Language code (default: zh-CN)' },
      category: { type: 'string', description: 'iTunes category' },
      explicit: { type: 'number', description: '1 if explicit content, 0 otherwise' },
      coverImage: { type: 'string', description: 'Cover image URL' },
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
        explicit: args.explicit as number | undefined,
        coverImage: args.coverImage as string | undefined,
        slug: args.slug as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(show, null, 2) }] };
    }
  );

  server.tool(
    'podcast_publish_show',
    'Publish a podcast show so it appears on the public site',
    {
      id: { type: 'string', description: 'Podcast show ID' },
    },
    async (args: { id: string }) => {
      const show = await podcastService.publishPodcast(args.id);
      if (!show) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      // Mirror the REST route (routes/podcasts.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(show, null, 2) }] };
    }
  );

  server.tool(
    'podcast_list_episodes',
    'List episodes for a podcast show, optionally filtered by status',
    {
      podcastId: { type: 'string', description: 'Podcast show ID' },
      status: { type: 'string', description: 'Filter by status: draft or published' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await episodeService.listEpisodes(args.podcastId as string, {
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'podcast_analytics',
    'Podcast consumption analytics: deduped downloads (total + windowed), active-subscriber estimate, top episodes, and feed-poll client distribution',
    {
      days: { type: 'number', description: 'Window in days for windowed downloads (default: 30)' },
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
      return { content: [{ type: 'text' as const, text: JSON.stringify({ summary, topEpisodes, clients }, null, 2) }] };
    }
  );

  server.tool(
    'podcast_create_episode',
    'Create or update a podcast episode (idempotent when an external id is given — safe for automated re-delivery)',
    {
      podcastId: { type: 'string', description: 'Podcast show ID' },
      title: { type: 'string', description: 'Episode title' },
      audioUrl: { type: 'string', description: 'URL of the audio file' },
      audioSize: { type: 'number', description: 'Audio file size in bytes' },
      duration: { type: 'number', description: 'Duration in seconds' },
      summary: { type: 'string', description: 'Short summary' },
      showNotes: { type: 'string', description: 'Full show notes (Markdown)' },
      episodeNumber: { type: 'number', description: 'Episode number' },
      seasonNumber: { type: 'number', description: 'Season number' },
      externalSource: { type: 'string', description: 'External source identifier (e.g. "adam")' },
      externalId: { type: 'string', description: 'External episode ID for idempotent upsert' },
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
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }
      const episode = await episodeService.createEpisode(podcastId, data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode, null, 2) }] };
    }
  );

  server.tool(
    'podcast_upload_audio',
    'Upload an audio file for a podcast episode (base64 encoded)',
    {
      filename: { type: 'string', description: 'Original filename (e.g. episode-1.mp3)' },
      base64: { type: 'string', description: 'Base64 encoded audio file content' },
      mimeType: { type: 'string', description: 'MIME type (e.g. audio/mpeg)' },
    },
    async (args: Record<string, unknown>) => {
      try {
        const result = await episodeService.uploadEpisodeAudio({
          filename: args.filename as string,
          base64: args.base64 as string,
          mimeType: args.mimeType as string,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'podcast_publish_episode',
    'Publish a podcast episode so it appears in the RSS feed and on the site',
    {
      id: { type: 'string', description: 'Episode ID' },
    },
    async (args: { id: string }) => {
      const episode = await episodeService.publishEpisode(args.id);
      if (!episode) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      // Mirror the REST route (routes/podcasts.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode, null, 2) }] };
    }
  );

  server.tool(
    'podcast_update_show',
    "Update a podcast show's metadata (title/description/slug/author/owner/category/cover/etc.). Triggers a site rebuild.",
    {
      id: { type: 'string', description: 'Podcast show ID' },
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
      explicit: { type: 'number', description: '1 if explicit content, 0 otherwise' },
      status: { type: 'string', description: 'Status: draft or published' },
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
        explicit: args.explicit as number | undefined,
        status: args.status as string | undefined,
      });
      if (!show) return { content: [{ type: 'text' as const, text: 'Podcast not found' }], isError: true };
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(show, null, 2) }] };
    }
  );

  server.tool(
    'podcast_update_episode',
    'Update a podcast episode (title/summary/show notes/transcript/episode number/type/publishedAt/etc.). Rebuilds the site when the episode is published.',
    {
      id: { type: 'string', description: 'Episode ID' },
      title: { type: 'string', description: 'Episode title' },
      summary: { type: 'string', description: 'Short summary' },
      showNotes: { type: 'string', description: 'Full show notes (HTML or Markdown)' },
      transcript: { type: 'string', description: 'Transcript text' },
      episodeNumber: { type: 'number', description: 'Episode number' },
      seasonNumber: { type: 'number', description: 'Season number' },
      episodeType: { type: 'string', description: 'Episode type: full, trailer, or bonus' },
      explicit: { type: 'number', description: '1 if explicit, 0 otherwise' },
      coverImage: { type: 'string', description: 'Episode cover image URL' },
      publishedAt: { type: 'number', description: 'Publish date as a unix epoch (seconds)' },
      status: { type: 'string', description: 'Status: draft or published' },
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
        explicit: args.explicit as number | undefined,
        coverImage: args.coverImage as string | undefined,
        publishedAt: args.publishedAt as number | undefined,
        status: args.status as string | undefined,
      });
      if (!episode) return { content: [{ type: 'text' as const, text: 'Episode not found' }], isError: true };
      // Only a published episode is visible in the feed/site, so only then rebuild.
      if (episode.status === 'published') buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode, null, 2) }] };
    }
  );

  server.tool(
    'podcast_import_feed',
    'Import an external podcast RSS feed (e.g. Anchor/Spotify): upserts every episode (idempotent by guid), keeping the original audio URLs and publish dates. Episodes import as draft unless status=published. When importing into an EXISTING show, the show\'s own metadata (title/cover/owner/etc.) is left untouched unless syncShow=1.',
    {
      feedUrl: { type: 'string', description: 'URL of the external RSS feed' },
      podcastId: { type: 'string', description: 'Target show ID to import into; if omitted, a new show is created from the feed' },
      externalSource: { type: 'string', description: 'Label stored on each episode for idempotent re-import (default: rss)' },
      status: { type: 'string', description: 'Status to import episodes as: draft (default) or published' },
      syncShow: { type: 'number', description: 'When importing into an existing show, set 1 to also overwrite the show metadata from the feed (cover, owner, category, ...). Default 0 = episodes only.' },
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
        content: [{ type: 'text' as const, text: JSON.stringify({ showId: podcastId, created: createdCount, updated: updatedCount, total: episodes.length }, null, 2) }],
      };
    }
  );

  server.tool(
    'podcast_upload_audio_from_url',
    'Fetch an audio file from a URL on the server and store it in the media library (avoids passing base64 through the client). Returns the hosted URL.',
    {
      url: { type: 'string', description: 'Public URL of the audio file to fetch' },
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
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    }
  );

  // App tools
  server.tool(
    'app_list',
    'List iOS app landing pages, optionally filtered by status',
    {
      status: { type: 'string', description: 'Filter by status: draft or published' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await appService.listApps({
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'app_create',
    'Create a new iOS app landing page with name, description, features, and App Store info',
    {
      name: { type: 'string', description: 'App name' },
      tagline: { type: 'string', description: 'Short tagline' },
      description: { type: 'string', description: 'Full description' },
      appStoreUrl: { type: 'string', description: 'App Store URL' },
      appStoreId: { type: 'string', description: 'App Store ID' },
      bundleId: { type: 'string', description: 'Bundle identifier' },
      platform: { type: 'string', description: 'Platform (default: iOS)' },
      features: { type: 'string', description: 'JSON array of feature objects [{icon, title, blurb}]' },
      screenshots: { type: 'string', description: 'JSON array of screenshot URLs' },
      links: { type: 'string', description: 'JSON object of additional links' },
      accentColor: { type: 'string', description: 'Accent color hex code' },
      icon: { type: 'string', description: 'App icon URL' },
      slug: { type: 'string', description: 'URL slug (auto-generated if not provided)' },
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
        features: args.features as string | undefined,
        screenshots: args.screenshots as string | undefined,
        links: args.links as string | undefined,
        accentColor: args.accentColor as string | undefined,
        icon: args.icon as string | undefined,
        slug: args.slug as string | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(app, null, 2) }] };
    }
  );

  server.tool(
    'app_publish',
    'Publish an app landing page so it appears on the public site',
    {
      id: { type: 'string', description: 'App ID' },
    },
    async (args: { id: string }) => {
      const app = await appService.publishApp(args.id);
      if (!app) return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      // Mirror the REST route (routes/apps.ts): publishing rebuilds the static site.
      buildService.triggerBuild();
      return { content: [{ type: 'text' as const, text: JSON.stringify(app, null, 2) }] };
    }
  );

  server.tool(
    'app_update',
    "Update an app's editorial display info (tagline/features/accentColor/links/sortOrder/status/...). NOTE: description, screenshots, and icon are managed by app_sync (synced from the App Store) and are NOT editable here — editing them would be reverted on the next sync. After editing, run the build-trigger tool to render on /apps/:slug.",
    {
      id: { type: 'string', description: 'App ID' },
      name: { type: 'string', description: 'App name' },
      slug: { type: 'string', description: 'URL slug' },
      tagline: { type: 'string', description: 'Short tagline' },
      accentColor: { type: 'string', description: 'Accent color hex code' },
      features: { type: 'string', description: 'JSON array of feature objects [{icon, title, blurb}]' },
      links: { type: 'string', description: 'JSON object of additional links' },
      sortOrder: { type: 'number', description: 'Sort order' },
      status: { type: 'string', description: 'Status: draft or published' },
      meta: { type: 'string', description: 'JSON metadata string' },
    },
    async (args: Record<string, unknown>) => {
      const app = await appService.updateApp(args.id as string, {
        name: args.name as string | undefined,
        slug: args.slug as string | undefined,
        tagline: args.tagline as string | undefined,
        accentColor: args.accentColor as string | undefined,
        features: args.features as string | undefined,
        links: args.links as string | undefined,
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: args.meta as string | undefined,
      });
      if (!app) {
        return { content: [{ type: 'text' as const, text: 'App not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(app, null, 2) }] };
    }
  );

  server.tool(
    'app_discover',
    'Discover apps from App Store Connect and create draft rows for new ones (idempotent; no sync, no publish, no ASC writeback).',
    {},
    async () => {
      try {
        const result = await appService.discoverApps();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Discovery failed';
        if (message.includes('ASC_NOT_CONFIGURED') || message.includes('ASC not configured')) {
          return { content: [{ type: 'text' as const, text: 'ASC not configured' }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Discovery failed: ${message}` }], isError: true };
      }
    }
  );

  // App sync tools
  server.tool(
    'app_sync',
    "Sync an app's metadata from the App Store (rating/category/version/screenshots) using iTunes Lookup and App Store Connect",
    {
      id: { type: 'string', description: 'App ID to sync' },
    },
    async (args: { id: string }) => {
      try {
        await appSyncService.syncApp(args.id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: args.id }, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        return { content: [{ type: 'text' as const, text: `Sync failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'app_sync_all',
    'Sync metadata for all apps that have an App Store ID (rating/category/version/screenshots)',
    {},
    async () => {
      const result = await appSyncService.syncAllApps();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Page tools (companion pages: privacy/terms/help/...)
  server.tool(
    'page_list',
    'List all WordBase pages (companion pages: privacy/terms/help/...)',
    {},
    async () => {
      const pages = await pageService.listPages();
      return { content: [{ type: 'text' as const, text: JSON.stringify(pages, null, 2) }] };
    }
  );

  server.tool(
    'page_get',
    'Get a single companion page by ID or slug',
    {
      idOrSlug: { type: 'string', description: 'Page ID or slug' },
    },
    async (args: Record<string, unknown>) => {
      const page = await pageService.getPage(args.idOrSlug as string);
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    }
  );

  server.tool(
    'page_create',
    'Create a companion page (privacy/terms/help/...). Use slug convention <app>-<type> (e.g. delphi-privacy). Optional app arg stamps meta.appId for app↔page association.',
    {
      title: { type: 'string', description: 'Page title' },
      content: { type: 'string', description: 'Page content in Markdown' },
      slug: { type: 'string', description: 'URL slug (recommended: <app>-<type>, e.g. delphi-privacy)' },
      sortOrder: { type: 'number', description: 'Sort order (default: 0)' },
      status: { type: 'string', description: 'Status: draft (default) or published' },
      meta: { type: 'string', description: 'JSON metadata string' },
      app: { type: 'string', description: 'App slug to associate this page with (stamps meta.appId)' },
    },
    async (args: Record<string, unknown>) => {
      let metaStr = args.meta as string | undefined;
      if (args.app) {
        let existing: Record<string, unknown> = {};
        if (metaStr) {
          try {
            const parsed = JSON.parse(metaStr);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object string' }], isError: true };
            }
            existing = parsed as Record<string, unknown>;
          } catch {
            return { content: [{ type: 'text' as const, text: 'Invalid meta: must be a JSON object string' }], isError: true };
          }
        }
        existing.appId = args.app as string;
        metaStr = JSON.stringify(existing);
      }
      const page = await pageService.createPage({
        title: args.title as string,
        content: args.content as string,
        slug: args.slug as string | undefined,
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: metaStr,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    }
  );

  server.tool(
    'page_update',
    'Update a companion page',
    {
      id: { type: 'string', description: 'Page ID' },
      title: { type: 'string', description: 'Page title' },
      slug: { type: 'string', description: 'URL slug' },
      content: { type: 'string', description: 'Page content in Markdown' },
      sortOrder: { type: 'number', description: 'Sort order' },
      status: { type: 'string', description: 'Status: draft or published' },
      meta: { type: 'string', description: 'JSON metadata string' },
    },
    async (args: Record<string, unknown>) => {
      const page = await pageService.updatePage(args.id as string, {
        title: args.title as string | undefined,
        slug: args.slug as string | undefined,
        content: args.content as string | undefined,
        sortOrder: args.sortOrder as number | undefined,
        status: args.status as string | undefined,
        meta: args.meta as string | undefined,
      });
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    }
  );

  server.tool(
    'page_delete',
    'Delete a companion page',
    {
      id: { type: 'string', description: 'Page ID' },
    },
    async (args: Record<string, unknown>) => {
      const deleted = await pageService.deletePage(args.id as string);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }, null, 2) }] };
    }
  );

  server.tool(
    'page_publish',
    'Publish a companion page (sets status=published). Run the build-trigger tool afterward to render it at its public URL.',
    {
      id: { type: 'string', description: 'Page ID' },
    },
    async (args: Record<string, unknown>) => {
      const page = await pageService.publishPage(args.id as string);
      if (!page) {
        return { content: [{ type: 'text' as const, text: 'Page not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(page, null, 2) }] };
    }
  );

  // Post meta tool
  server.tool(
    'blog_update_post_meta',
    'Update SEO metadata for a post (og:title, og:description, og:image)',
    {
      id: { type: 'string', description: 'Post ID' },
      description: { type: 'string', description: 'Meta description / og:description' },
      ogTitle: { type: 'string', description: 'og:title (defaults to post title)' },
      ogImage: { type: 'string', description: 'og:image URL' },
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
    }
  );
}
