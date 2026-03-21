import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

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
export type ApiKey = typeof apiKeys.$inferSelect;
export type Redirect = typeof redirects.$inferSelect;
