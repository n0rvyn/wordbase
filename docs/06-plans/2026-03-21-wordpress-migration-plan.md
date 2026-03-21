---
type: plan
status: active
tags: [migration, wordpress, mysql, sqlite, turndown]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# WordPress Migration (Phase 8) Implementation Plan

**Goal:** Migrate all content from WordPress MySQL database to the new SQLite-based blog system, including posts, pages, categories, tags, media, comments, and URL redirects.

**Architecture:** Single migration script connects to WordPress via SSH tunnel + MySQL, converts HTML to Markdown using turndown, downloads media files from remote server via SSH, and writes to local SQLite using Drizzle ORM. Redirect entries are generated from old WordPress permalink structure to new slug-based URLs.

**Tech Stack:** TypeScript, mysql2, turndown, Drizzle ORM, better-sqlite3, nanoid, SSH/SCP

**Design doc:** /Users/norvyn/Code/Projects/wordbase/docs/06-plans/2026-03-21-wordbase-blog-system-design.md

**Design analysis:** none

**Crystal file:** none

---

## Dependencies

Before running migration, add required packages:

```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/api
pnpm add mysql2 turndown
pnpm add -D @types/mysql2
```

---

## Tasks

<!-- section: task-1 keywords: migrate, mysql, connection -->
### Task 1: Create Migration Script with MySQL Connection

**Files:**
- Create: `scripts/migrate.ts`

**Steps:**
1. Create the scripts directory at project root if it doesn't exist
2. Create `scripts/migrate.ts` with the following structure:
   - Import required packages: mysql2/promise, turndown, drizzle-orm, nanoid
   - Define WordPress MySQL connection config (use localhost:3307 via SSH tunnel)
   - Create connection pool to WordPress database
   - Test connection and log success/failure
   - Close connection on exit

3. Add type definitions for WordPress tables (WP types):
   ```typescript
   interface WpPost {
     ID: number;
     post_title: string;
     post_content: string;
     post_excerpt: string;
     post_name: string;
     post_status: string;
     post_date: string;
     post_type: string;
     guid: string;
   }

   interface WpTerm {
     term_id: number;
     name: string;
     slug: string;
   }

   interface WpTermTaxonomy {
     term_taxonomy_id: number;
     term_id: number;
     taxonomy: string;
     description: string;
   }

   interface WpTermRelationship {
     object_id: number;
     term_taxonomy_id: number;
   }

   interface WpComment {
     comment_ID: number;
     comment_post_ID: number;
     comment_author: string;
     comment_author_email: string;
     comment_author_url: string;
     comment_content: string;
     comment_date: string;
     comment_approved: string;
     comment_parent: number;
     comment_author_IP: string;
     comment_agent: string;
   }

   interface WpPostMeta {
     post_id: number;
     meta_key: string;
     meta_value: string;
   }
   ```

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Script starts, connects to MySQL via localhost:3307, logs "Connected to WordPress MySQL successfully", then exits (no data written yet)
<!-- /section -->

<!-- section: task-2 keywords: migrate, categories, tags -->
### Task 2: Import Categories and Tags

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Add import statements for Drizzle schema:
   ```typescript
   import { db } from '../packages/api/src/db/index.js';
   import { categories, tags } from '../packages/api/src/db/schema.js';
   import { eq } from 'drizzle-orm';
   ```

2. Add category import function:
   - Query `blog_term_taxonomy` where `taxonomy = 'category'`
   - Join with `blog_terms` to get term name and slug
   - Map each category to new format: { id: nanoid(), slug, name, description }
   - Insert into SQLite using Drizzle
   - Return mapping of old term_id -> new id

3. Add tag import function:
   - Query `blog_term_taxonomy` where `taxonomy = 'post_tag'`
   - Join with `blog_terms` to get term name and slug
   - Map each tag to new format: { id: nanoid(), slug, name }
   - Insert into SQLite using Drizzle
   - Return mapping of old term_id -> new id

4. Add term relationships import function:
   - Query `blog_term_relationships` to get post-term mappings
   - Map object_id (post ID) to term_taxonomy_id
   - Build post_categories and post_tags junction entries
   - Use the category/tag ID mappings from previous steps

5. Add logging for imported counts

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Imported X categories", "Imported Y tags", "Created Z category relationships", "Created W tag relationships"
<!-- /section -->

<!-- section: task-3 keywords: migrate, posts, turndown, markdown -->
### Task 3: Import Posts (HTML to Markdown)

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Add turndown service configuration:
   ```typescript
   import TurndownService from 'turndown';

   const turndownService = new TurndownService({
     headingStyle: 'atx',
     codeBlockStyle: 'fenced',
     bulletListMarker: '-',
     emDelimiter: '*'
   });

   // Custom rules for WordPress-specific HTML
   turndownService.addRule('pre', {
     filter: 'pre',
     replacement: (content) => `\`\`\`\n${content}\n\`\`\``
   });
   ```

2. Add post import function:
   - Query `blog_posts` where `post_type = 'post'` and `post_status IN ('publish', 'draft', 'private')`
   - For each post:
     - Convert HTML content to Markdown using turndown
     - Map status: 'publish' -> 'published', 'draft' -> 'draft', 'private' -> 'archived'
     - Extract slug from `post_name`, fallback to sanitized title
     - Parse `post_date` to Unix timestamp for created_at and published_at
     - Handle excerpt (use post_excerpt if exists, otherwise auto-generate from content)
   - Insert into SQLite posts table

3. Add cover image handling:
   - Query `blog_postmeta` for posts with `_thumbnail_id`
   - Resolve thumbnail ID to attachment URL
   - Update post's cover_image after media is imported (Task 5)

4. Add post ID mapping: Map old WP post ID -> new nanoid for comment linking

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Imported X posts" (expect 126 posts per acceptance criteria)
<!-- /section -->

<!-- section: task-4 keywords: migrate, pages -->
### Task 4: Import Pages

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Add page import function:
   - Query `blog_posts` where `post_type = 'page'`
   - Convert HTML content to Markdown using turndown
   - Map status: 'publish' -> 'published', 'draft' -> 'draft'
   - Set sort_order from menu_order field (or default 0)
   - Use post_name as slug

2. Insert into SQLite pages table

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Imported X pages" (expect 8 pages per acceptance criteria)
<!-- /section -->

<!-- section: task-5 keywords: migrate, media, download, ssh -->
### Task 5: Download and Import Media Attachments

**Files:**
- Modify: `scripts/migrate.ts`
- Create: Directory structure for media storage

**Steps:**
1. Add media query function:
   - Query `blog_posts` where `post_type = 'attachment'`
   - Get guid (original URL), post_title (filename), post_mime_type
   - Filter for common image types: jpg, jpeg, png, gif, webp, svg

2. Add SSH/SCP download logic:
   - Remote path: `/var/www/blog/wp-content/uploads/YEAR/MONTH/filename`
   - Parse the guid to extract the relative path from uploads/
   - Construct remote file path: `/var/www/blog/wp-content/uploads/` + relative path
   - Create local directory: `packages/api/data/uploads/YYYY/MM/`
   - Use SSH2 or child_process.exec with scp to download files
   - Example using exec:
     ```typescript
     import { exec } from 'child_process';
     import { promisify } from 'util';
     const execAsync = promisify(exec);

     async function downloadFile(remotePath: string, localPath: string) {
       // Ensure local directory exists
       await fs.mkdir(dirname(localPath), { recursive: true });
       // Use scp to download
       await execAsync(`scp -o StrictHostKeyChecking=no norvyn:"${remotePath}" "${localPath}"`);
     }
     ```

3. Add media metadata extraction:
   - Get file size from downloaded file
   - For images: extract width/height using a lightweight method or skip (optional)
   - Store original filename, new path, mime_type, size

4. Insert media records into SQLite media table

5. Add content path rewriting:
   - After media download, scan all imported post content
   - Replace old WP URLs (e.g., `https://norvyn.com/wp-content/uploads/...`) with new local paths
   - Update post content in SQLite

6. Handle cover images from postmeta:
   - Query blog_postmeta for `_thumbnail_id`
   - Map old attachment ID to new media record
   - Update posts.cover_image with new media path

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Downloaded X media files", "Imported X media records" (expect 201 media files per acceptance criteria)
<!-- /section -->

<!-- section: task-6 keywords: migrate, comments, nesting -->
### Task 6: Import Comments with Nesting

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Add comment import function:
   - Query `blog_comments` ordered by comment_ID (ensures parents exist first)
   - Map WP status: '1' -> 'approved', '0' -> 'pending', 'spam' -> 'spam'
   - Map comment_approved to status

2. Handle parent-child relationships:
   - Use comment_parent to link to parent comment
   - Since we import in order and use nanoid for new IDs, we need a mapping: old comment_ID -> new nanoid
   - When inserting, look up new parent_id from the mapping (if parent exists)

3. Link to posts:
   - Map old post ID to new post nanoid using the mapping from Task 3

4. Insert comments into SQLite comments table

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Imported X comments with Y replies" (comments show correct parent-child nesting)
<!-- /section -->

<!-- section: task-7 keywords: migrate, redirects, url-mapping -->
### Task 7: Generate Redirect Entries

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Analyze WordPress permalink structure:
   - Common formats: `/YYYY/MM/post-slug/`, `/post-slug/`, `?p=ID`
   - Assume date-based: `/YYYY/MM/post-slug/`

2. For each imported post:
   - Old URL format: `https://norvyn.com/YYYY/MM/post-slug/` (or similar)
   - New URL format: `/posts/post-slug`
   - Generate redirect: from_path = `/YYYY/MM/post-slug/`, to_path = `/posts/post-slug`

3. For pages:
   - Old URL: `https://norvyn.com/page/page-slug/` or `?page_id=ID`
   - New URL: `/pages/page-slug`
   - Generate redirect entries

4. Insert redirect records into SQLite redirects table

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Logs show "Generated X redirects for posts", "Generated Y redirects for pages"
<!-- /section -->

<!-- section: task-8 keywords: migrate, verification, integrity -->
### Task 8: Verify Migrated Data Integrity

**Files:**
- Modify: `scripts/migrate.ts`

**Steps:**
1. Add verification function that queries SQLite and compares counts:
   - Count posts: `SELECT COUNT(*) FROM posts` - expect 126
   - Count pages: `SELECT COUNT(*) FROM pages` - expect 8
   - Count categories: `SELECT COUNT(*) FROM categories` - expect 12
   - Count tags: `SELECT COUNT(*) FROM tags` - expect 173
   - Count media: `SELECT COUNT(*) FROM media` - expect 201
   - Count comments: `SELECT COUNT(*) FROM comments`

2. Verify redirect entries exist:
   - `SELECT COUNT(*) FROM redirects` - should be > 0

3. Verify post content is Markdown (not HTML):
   - Sample select posts.content and check for absence of HTML tags like `<p>`, `<div>`

4. Verify parent-child comment relationships:
   - `SELECT COUNT(*) FROM comments WHERE parent_id IS NOT NULL`

5. Log all verification results with pass/fail status

**Verify:**
Run: `pnpm --filter api tsx scripts/migrate.ts`
Expected: Final output shows verification summary with all counts matching acceptance criteria
<!-- /section -->

---

## Usage

### Prerequisites

1. **Establish SSH tunnel** (in separate terminal):
   ```bash
   ssh -L 3307:localhost:3306 norvyn
   ```

2. **Verify tunnel is active**:
   ```bash
   mysql -h 127.0.0.1 -P 3307 -u u_blog -p db_blog
   # Password: see .env file
   ```

### Run Migration

```bash
cd /Users/norvyn/Code/Projects/wordbase
pnpm --filter api tsx scripts/migrate.ts
```

### Expected Output

```
=== WordPress Migration ===
Connected to WordPress MySQL successfully
Fetching categories...
Imported 12 categories
Fetching tags...
Imported 173 tags
Fetching posts...
Converted 126 posts to Markdown
Imported 126 posts
Fetching pages...
Imported 8 pages
Downloading media attachments...
Downloaded 201 media files
Fetching comments...
Imported X comments with Y nested replies
Generating redirects...
Generated 134 redirects (126 posts + 8 pages)

=== Verification ===
Posts: 126 (expected: 126) ✓
Pages: 8 (expected: 8) ✓
Categories: 12 (expected: 12) ✓
Tags: 173 (expected: 173) ✓
Media: 201 (expected: 201) ✓
Comments: [count] ✓
Redirects: 134 ✓

Migration completed successfully!
```

---

## Rollback Plan

If migration fails or needs to be re-run:

1. **Backup SQLite before migration** (recommended before first run):
   ```bash
   cp packages/api/data/blog.db packages/api/data/blog.db.backup
   ```

2. **Restore if needed**:
   ```bash
   cp packages/api/data/blog.db.backup packages/api/data/blog.db
   ```

3. **Clear uploaded media if re-running**:
   ```bash
   rm -rf packages/api/data/uploads/*
   ```

---

## Decisions

None.

---

## Summary

- **Plan file:** `/Users/norvyn/Code/Projects/wordbase/docs/06-plans/2026-03-21-wordpress-migration-plan.md`
- **Tasks:** 8 tasks
- **Key files to create/modify:**
  - Create: `scripts/migrate.ts` (main migration script)
  - Modify: `packages/api/package.json` (add mysql2, turndown dependencies)
- **Dependencies to add:** mysql2, turndown
- **Prerequisites:** SSH tunnel to remote MySQL (`ssh -L 3307:localhost:3306 norvyn`)

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21