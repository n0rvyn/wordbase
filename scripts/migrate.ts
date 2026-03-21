/**
 * WordPress → Wordbase Migration Script
 *
 * Prerequisites:
 * 1. SSH tunnel: ssh -L 3307:localhost:3306 norvyn
 * 2. Run: cd packages/api && pnpm tsx ../../scripts/migrate.ts
 */

import mysql from 'mysql2/promise';
import TurndownService from 'turndown';
import { nanoid } from 'nanoid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { db } from '../packages/api/src/db/index.js';
import { initializeDatabase } from '../packages/api/src/db/index.js';
import {
  posts, categories, tags, postCategories, postTags,
  comments, media, pages, redirects,
} from '../packages/api/src/db/schema.js';
import { sql, eq } from 'drizzle-orm';

const execAsync = promisify(exec);

// ── Configuration ──
const WP_DB = {
  host: process.env.WP_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.WP_DB_PORT || '3307'),
  user: process.env.WP_DB_USER || 'u_blog',
  password: process.env.WP_DB_PASSWORD || '',
  database: process.env.WP_DB_NAME || 'db_blog',
};
const TABLE_PREFIX = 'blog_';
const REMOTE_HOST = 'norvyn';
const REMOTE_UPLOADS = '/var/www/blog/wp-content/uploads';
const LOCAL_UPLOADS = join(process.cwd(), 'data', 'uploads');

// ── Turndown Setup ──
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// WordPress caption shortcode handling
turndown.addRule('wpCaption', {
  filter: (node) => {
    return node.nodeName === 'DIV' && (node.getAttribute('class') || '').includes('wp-caption');
  },
  replacement: (content) => content.trim(),
});

// ── ID Mappings ──
const postIdMap = new Map<number, string>(); // WP post_ID → nanoid
const categoryIdMap = new Map<number, string>(); // WP term_id → nanoid
const tagIdMap = new Map<number, string>(); // WP term_id → nanoid
const commentIdMap = new Map<number, string>(); // WP comment_ID → nanoid
const mediaIdMap = new Map<number, { id: string; path: string }>(); // WP attachment_ID → { id, path }

async function main() {
  console.log('=== WordPress → Wordbase Migration ===\n');

  // Initialize local database
  initializeDatabase();

  // Clear existing data (for re-runability)
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(comments);
  await db.delete(posts);
  await db.delete(pages);
  await db.delete(categories);
  await db.delete(tags);
  await db.delete(media);
  await db.delete(redirects);
  console.log('Cleared existing data.\n');

  // Connect to WordPress MySQL
  const pool = await mysql.createPool(WP_DB);
  console.log('Connected to WordPress MySQL via SSH tunnel.\n');

  try {
    await importCategories(pool);
    await importTags(pool);
    await importPosts(pool);
    await importPages(pool);
    await importMedia(pool);
    await rewriteMediaUrls(pool);
    await importComments(pool);
    await generateRedirects(pool);
    await verify();
  } finally {
    await pool.end();
  }

  console.log('\n=== Migration completed successfully! ===');
}

// ── Import Categories ──
async function importCategories(pool: mysql.Pool) {
  console.log('Fetching categories...');
  const [rows] = await pool.query(`
    SELECT t.term_id, t.name, t.slug, tt.description
    FROM ${TABLE_PREFIX}term_taxonomy tt
    JOIN ${TABLE_PREFIX}terms t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = 'category'
    ORDER BY t.term_id
  `);

  const cats = rows as any[];
  for (const cat of cats) {
    const id = nanoid();
    categoryIdMap.set(cat.term_id, id);
    await db.insert(categories).values({
      id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description || null,
      sortOrder: 0,
    });
  }
  console.log(`Imported ${cats.length} categories.`);
}

// ── Import Tags ──
async function importTags(pool: mysql.Pool) {
  console.log('Fetching tags...');
  const [rows] = await pool.query(`
    SELECT t.term_id, t.name, t.slug
    FROM ${TABLE_PREFIX}term_taxonomy tt
    JOIN ${TABLE_PREFIX}terms t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = 'post_tag'
    ORDER BY t.term_id
  `);

  const tgs = rows as any[];
  for (const tag of tgs) {
    const id = nanoid();
    tagIdMap.set(tag.term_id, id);
    await db.insert(tags).values({
      id,
      slug: tag.slug,
      name: tag.name,
    });
  }
  console.log(`Imported ${tgs.length} tags.`);
}

// ── Import Posts ──
async function importPosts(pool: mysql.Pool) {
  console.log('Fetching posts...');
  const [rows] = await pool.query(`
    SELECT ID, post_title, post_content, post_excerpt, post_name, post_status, post_date, post_modified
    FROM ${TABLE_PREFIX}posts
    WHERE post_type = 'post' AND post_status IN ('publish', 'draft', 'private')
    ORDER BY ID
  `);

  const wpPosts = rows as any[];
  for (const wp of wpPosts) {
    const id = nanoid();
    postIdMap.set(wp.ID, id);

    const content = turndown.turndown(wp.post_content || '');
    const statusMap: Record<string, string> = { publish: 'published', draft: 'draft', private: 'archived' };
    const status = statusMap[wp.post_status] || 'draft';
    const createdAt = Math.floor(new Date(wp.post_date).getTime() / 1000);
    const updatedAt = Math.floor(new Date(wp.post_modified).getTime() / 1000);
    const publishedAt = status === 'published' ? createdAt : null;

    await db.insert(posts).values({
      id,
      slug: wp.post_name || nanoid(8),
      title: wp.post_title,
      content,
      excerpt: wp.post_excerpt || null,
      status,
      publishedAt,
      createdAt,
      updatedAt,
      meta: null,
      coverImage: null,
      shareToken: null,
    });
  }

  // Import term relationships
  const [rels] = await pool.query(`
    SELECT tr.object_id, tt.term_id, tt.taxonomy
    FROM ${TABLE_PREFIX}term_relationships tr
    JOIN ${TABLE_PREFIX}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    WHERE tt.taxonomy IN ('category', 'post_tag')
  `);

  let catRels = 0, tagRels = 0;
  for (const rel of rels as any[]) {
    const newPostId = postIdMap.get(rel.object_id);
    if (!newPostId) continue;

    if (rel.taxonomy === 'category') {
      const newCatId = categoryIdMap.get(rel.term_id);
      if (newCatId) {
        await db.insert(postCategories).values({ postId: newPostId, categoryId: newCatId });
        catRels++;
      }
    } else if (rel.taxonomy === 'post_tag') {
      const newTagId = tagIdMap.get(rel.term_id);
      if (newTagId) {
        await db.insert(postTags).values({ postId: newPostId, tagId: newTagId });
        tagRels++;
      }
    }
  }

  console.log(`Imported ${wpPosts.length} posts (${catRels} category links, ${tagRels} tag links).`);
}

// ── Import Pages ──
async function importPages(pool: mysql.Pool) {
  console.log('Fetching pages...');
  const [rows] = await pool.query(`
    SELECT ID, post_title, post_content, post_name, post_status, post_date, post_modified, menu_order
    FROM ${TABLE_PREFIX}posts
    WHERE post_type = 'page' AND post_status IN ('publish', 'draft')
    ORDER BY ID
  `);

  const wpPages = rows as any[];
  for (const wp of wpPages) {
    const content = turndown.turndown(wp.post_content || '');
    const status = wp.post_status === 'publish' ? 'published' : 'draft';
    const createdAt = Math.floor(new Date(wp.post_date).getTime() / 1000);
    const updatedAt = Math.floor(new Date(wp.post_modified).getTime() / 1000);

    await db.insert(pages).values({
      id: nanoid(),
      slug: wp.post_name || nanoid(8),
      title: wp.post_title,
      content,
      sortOrder: wp.menu_order || 0,
      status,
      meta: null,
      createdAt,
      updatedAt,
    });
  }
  console.log(`Imported ${wpPages.length} pages.`);
}

// ── Import Media ──
async function importMedia(pool: mysql.Pool) {
  console.log('Fetching media attachments...');
  const [rows] = await pool.query(`
    SELECT p.ID, p.post_title, p.post_mime_type, p.guid,
           pm.meta_value as file_path
    FROM ${TABLE_PREFIX}posts p
    LEFT JOIN ${TABLE_PREFIX}postmeta pm ON p.ID = pm.post_id AND pm.meta_key = '_wp_attached_file'
    WHERE p.post_type = 'attachment'
    ORDER BY p.ID
  `);

  const attachments = rows as any[];
  let downloaded = 0, failed = 0;

  for (const att of attachments) {
    const filePath = att.file_path || '';
    if (!filePath) continue;

    const remotePath = `${REMOTE_UPLOADS}/${filePath}`;
    const localPath = join(LOCAL_UPLOADS, filePath);
    const id = nanoid();

    try {
      await mkdir(dirname(localPath), { recursive: true });
      await execAsync(`scp -o StrictHostKeyChecking=no "${REMOTE_HOST}:${remotePath}" "${localPath}"`);

      const fileStat = await stat(localPath);
      const filename = filePath.split('/').pop() || 'unknown';

      await db.insert(media).values({
        id,
        filename,
        path: filePath,
        mimeType: att.post_mime_type || 'application/octet-stream',
        size: fileStat.size,
        width: null,
        height: null,
        altText: att.post_title || null,
        createdAt: Math.floor(Date.now() / 1000),
      });

      mediaIdMap.set(att.ID, { id, path: filePath });
      downloaded++;
    } catch (err: any) {
      console.warn(`  Failed to download: ${filePath} (${err.message})`);
      failed++;
    }
  }
  console.log(`Downloaded ${downloaded} media files (${failed} failed).`);
}

// ── Rewrite Media URLs in Post Content ──
async function rewriteMediaUrls(pool: mysql.Pool) {
  console.log('Rewriting media URLs in post content...');

  // Get all posts and update content
  const allPosts = await db.select().from(posts);
  let rewritten = 0;

  for (const post of allPosts) {
    let content = post.content;
    let changed = false;

    // Replace WordPress upload URLs with local paths
    // Patterns: https://norvyn.com/wp-content/uploads/YYYY/MM/file.ext
    //           http://norvyn.com/wp-content/uploads/YYYY/MM/file.ext
    const urlPattern = /https?:\/\/norvyn\.com\/wp-content\/uploads\/([^\s)"']+)/g;
    content = content.replace(urlPattern, (_match, path) => {
      changed = true;
      return `/uploads/${path}`;
    });

    if (changed) {
      await db.update(posts).set({ content }).where(eq(posts.id, post.id));
      rewritten++;
    }
  }

  // Update cover images from postmeta
  const [thumbRows] = await pool.query(`
    SELECT pm.post_id, pm.meta_value as thumbnail_id
    FROM ${TABLE_PREFIX}postmeta pm
    WHERE pm.meta_key = '_thumbnail_id'
  `);

  let covers = 0;
  for (const row of thumbRows as any[]) {
    const newPostId = postIdMap.get(row.post_id);
    const mediaInfo = mediaIdMap.get(parseInt(row.thumbnail_id));
    if (newPostId && mediaInfo) {
      await db.update(posts).set({ coverImage: `/uploads/${mediaInfo.path}` }).where(eq(posts.id, newPostId));
      covers++;
    }
  }

  console.log(`Rewrote URLs in ${rewritten} posts, set ${covers} cover images.`);
}

// ── Import Comments ──
async function importComments(pool: mysql.Pool) {
  console.log('Fetching comments...');
  const [rows] = await pool.query(`
    SELECT comment_ID, comment_post_ID, comment_author, comment_author_email,
           comment_author_url, comment_content, comment_date, comment_approved,
           comment_parent, comment_author_IP, comment_agent
    FROM ${TABLE_PREFIX}comments
    ORDER BY comment_ID
  `);

  const wpComments = rows as any[];
  let imported = 0, replies = 0;

  for (const wc of wpComments) {
    const newPostId = postIdMap.get(wc.comment_post_ID);
    if (!newPostId) continue;

    const id = nanoid();
    commentIdMap.set(wc.comment_ID, id);

    const statusMap: Record<string, string> = { '1': 'approved', '0': 'pending', spam: 'spam' };
    const status = statusMap[wc.comment_approved] || 'pending';

    const parentId = wc.comment_parent > 0 ? (commentIdMap.get(wc.comment_parent) || null) : null;
    if (parentId) replies++;

    await db.insert(comments).values({
      id,
      postId: newPostId,
      parentId,
      authorName: wc.comment_author || 'Anonymous',
      authorEmail: wc.comment_author_email || null,
      authorUrl: wc.comment_author_url || null,
      content: wc.comment_content || '',
      status,
      ipAddress: wc.comment_author_IP || null,
      userAgent: wc.comment_agent || null,
      createdAt: Math.floor(new Date(wc.comment_date).getTime() / 1000),
    });
    imported++;
  }
  console.log(`Imported ${imported} comments (${replies} nested replies).`);
}

// ── Generate Redirects ──
async function generateRedirects(pool: mysql.Pool) {
  console.log('Generating redirects...');

  // Get WordPress permalink structure from posts
  const [rows] = await pool.query(`
    SELECT ID, post_name, post_date, post_type
    FROM ${TABLE_PREFIX}posts
    WHERE post_type IN ('post', 'page') AND post_status = 'publish'
    ORDER BY ID
  `);

  let count = 0;
  for (const wp of rows as any[]) {
    const date = new Date(wp.post_date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    if (wp.post_type === 'post') {
      // WordPress default permalink: /YYYY/MM/slug/
      const fromPath = `/${year}/${month}/${wp.post_name}/`;
      const toPath = `/posts/${wp.post_name}`;

      await db.insert(redirects).values({
        id: nanoid(),
        fromPath,
        toPath,
        statusCode: 301,
        createdAt: Math.floor(Date.now() / 1000),
      });
      count++;

      // Also add without trailing slash
      await db.insert(redirects).values({
        id: nanoid(),
        fromPath: `/${year}/${month}/${wp.post_name}`,
        toPath: `/posts/${wp.post_name}`,
        statusCode: 301,
        createdAt: Math.floor(Date.now() / 1000),
      });
      count++;
    } else if (wp.post_type === 'page') {
      // Pages: /slug/ → /slug
      const fromPath = `/${wp.post_name}/`;
      const toPath = `/${wp.post_name}`;

      await db.insert(redirects).values({
        id: nanoid(),
        fromPath,
        toPath,
        statusCode: 301,
        createdAt: Math.floor(Date.now() / 1000),
      });
      count++;
    }
  }
  console.log(`Generated ${count} redirect entries.`);
}

// ── Verification ──
async function verify() {
  console.log('\n=== Verification ===');

  const checks = [
    { name: 'Posts', table: posts, expected: 126 },
    { name: 'Pages', table: pages, expected: 8 },
    { name: 'Categories', table: categories, expected: 12 },
    { name: 'Tags', table: tags, expected: 173 },
    { name: 'Media', table: media, expected: 201 },
  ];

  for (const check of checks) {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(check.table);
    const pass = result.count >= check.expected ? '✓' : `✗ (expected ${check.expected})`;
    console.log(`${check.name}: ${result.count} ${pass}`);
  }

  // Comments count (no fixed expected)
  const [commentsResult] = await db.select({ count: sql<number>`count(*)` }).from(comments);
  console.log(`Comments: ${commentsResult.count}`);

  // Nested comments
  const [nestedResult] = await db.select({ count: sql<number>`count(*)` }).from(comments).where(sql`parent_id IS NOT NULL`);
  console.log(`Nested replies: ${nestedResult.count}`);

  // Redirects
  const [redirectsResult] = await db.select({ count: sql<number>`count(*)` }).from(redirects);
  console.log(`Redirects: ${redirectsResult.count}`);

  // Sample content check (no HTML tags)
  const [samplePost] = await db.select().from(posts).limit(1);
  if (samplePost) {
    const hasHtml = /<(p|div|span|h[1-6]|ul|ol|li|a|img|br|hr)\b/i.test(samplePost.content);
    console.log(`Content format: ${hasHtml ? '✗ Contains HTML' : '✓ Markdown (no HTML tags detected)'}`);
  }
}

// ── Run ──
main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
