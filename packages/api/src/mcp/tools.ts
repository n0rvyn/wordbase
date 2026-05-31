import * as postService from '../services/post.service.js';
import * as mediaService from '../services/media.service.js';
import * as commentService from '../services/comment.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as buildService from '../services/build.service.js';
import * as redirectService from '../services/redirect.service.js';
import * as podcastService from '../services/podcast.service.js';
import * as episodeService from '../services/episode.service.js';
import * as appService from '../services/app.service.js';
import * as appSyncService from '../services/app-sync.service.js';

export function registerTools(server: any) {
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(episode, null, 2) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(app, null, 2) }] };
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
