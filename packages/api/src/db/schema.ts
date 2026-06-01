import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// posts table
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  coverImage: text('cover_image'),
  status: text('status').notNull().default('draft'),
  shareToken: text('share_token').unique(),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'), // JSON
});

// categories table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
});

// tags table
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
});

// post_categories junction table
export const postCategories = sqliteTable('post_categories', {
  postId: text('post_id').notNull(),
  categoryId: text('category_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.categoryId] }),
}));

// post_tags junction table
export const postTags = sqliteTable('post_tags', {
  postId: text('post_id').notNull(),
  tagId: text('tag_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.tagId] }),
}));

// comments table
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  parentId: text('parent_id'),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email'),
  authorUrl: text('author_url'),
  content: text('content').notNull(),
  status: text('status').notNull().default('pending'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
});

// media table
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  altText: text('alt_text'),
  createdAt: integer('created_at').notNull(),
});

// pages table
export const pages = sqliteTable('pages', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0),
  status: text('status').notNull().default('draft'),
  meta: text('meta'), // JSON
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// settings table
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// page_views table
export const pageViews = sqliteTable('page_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull(),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'),
  createdAt: integer('created_at').notNull(),
});

// request_metrics table — one row per server-side request (Stage B observability).
// `route` is the matched Hono pattern (e.g. /api/posts/:id), NOT the raw path,
// so cardinality stays bounded regardless of traffic.
export const requestMetrics = sqliteTable('request_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  method: text('method').notNull(),
  route: text('route').notNull(),
  status: integer('status').notNull(),
  durationMs: real('duration_ms').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  createdIdx: index('ix_request_metrics_created').on(t.createdAt),
  routeIdx: index('ix_request_metrics_route').on(t.method, t.route),
}));

// api_keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  permissions: text('permissions').notNull(), // JSON array
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
});

// redirects table
export const redirects = sqliteTable('redirects', {
  id: text('id').primaryKey(),
  fromPath: text('from_path').unique().notNull(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').default(301),
  createdAt: integer('created_at').notNull(),
});

// podcasts table
export const podcasts = sqliteTable('podcasts', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  author: text('author'),
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  language: text('language').notNull().default('zh-CN'),
  category: text('category'),
  explicit: integer('explicit').notNull().default(0),
  link: text('link'),
  copyright: text('copyright'),
  status: text('status').notNull().default('draft'),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
});

// podcast_episodes table
export const podcastEpisodes = sqliteTable('podcast_episodes', {
  id: text('id').primaryKey(),
  podcastId: text('podcast_id').notNull(),
  slug: text('slug').unique().notNull(),
  guid: text('guid').unique().notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  showNotes: text('show_notes'),
  transcript: text('transcript'),
  audioUrl: text('audio_url').notNull(),
  audioType: text('audio_type').notNull().default('audio/mpeg'),
  audioSize: integer('audio_size').notNull().default(0),
  duration: integer('duration'),
  coverImage: text('cover_image'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
  episodeType: text('episode_type').notNull().default('full'),
  explicit: integer('explicit'),
  status: text('status').notNull().default('draft'),
  publishedAt: integer('published_at'),
  externalSource: text('external_source'),
  externalId: text('external_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
}, (t) => ({
  extUnique: uniqueIndex('ux_episode_external').on(t.externalSource, t.externalId),
  podcastIdx: index('ix_episode_podcast').on(t.podcastId),
}));

// apps table
export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  icon: text('icon'),
  description: text('description'),
  appStoreUrl: text('app_store_url'),
  appStoreId: text('app_store_id'),
  bundleId: text('bundle_id'),
  platform: text('platform').notNull().default('iOS'),
  price: text('price'),
  rating: real('rating'),
  ratingCount: integer('rating_count'),
  accentColor: text('accent_color'),
  features: text('features'),
  screenshots: text('screenshots'),
  links: text('links'),
  status: text('status').notNull().default('draft'),
  sortOrder: integer('sort_order').default(0),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
  // App Store sync columns
  category: text('category'),
  version: text('version'),
  releaseDate: integer('release_date'),
  currentVersionReleaseDate: integer('current_version_release_date'),
  minimumOsVersion: text('minimum_os_version'),
  subtitle: text('subtitle'),
  whatsNew: text('whats_new'),
  featured: integer('featured').notNull().default(0),
  lastSyncedAt: integer('last_synced_at'),
});

// Type exports for queries
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
export type RequestMetric = typeof requestMetrics.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Redirect = typeof redirects.$inferSelect;
export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;
export type NewPodcastEpisode = typeof podcastEpisodes.$inferInsert;
export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
