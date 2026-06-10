import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

export const DB_FILE = process.env.WORDBASE_DB_PATH || './data/blog.db';
const sqlite = new Database(DB_FILE);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });

// Expose only primitive pragma values (keeps the better-sqlite3 type internal,
// which declaration emit cannot otherwise name across modules).
export function dbPragmas() {
  return {
    pageCount: sqlite.pragma('page_count', { simple: true }) as number,
    pageSize: sqlite.pragma('page_size', { simple: true }) as number,
    journalMode: sqlite.pragma('journal_mode', { simple: true }) as string,
  };
}

// Initialize tables
export function initializeDatabase() {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      cover_image TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      share_token TEXT UNIQUE,
      published_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_categories (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_email TEXT,
      author_url TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      alt_text TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      meta TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      country TEXT,
      visitor_id TEXT,
      created_at INTEGER NOT NULL
    );

    -- Observability read-path indexes. created_at + path are original columns
    -- (always present), so they index safely here. country is indexed separately
    -- after its legacy ALTER below, since it may not yet exist on old prod DBs.
    CREATE INDEX IF NOT EXISTS ix_page_views_created ON page_views(created_at);
    CREATE INDEX IF NOT EXISTS ix_page_views_path ON page_views(path);

    CREATE TABLE IF NOT EXISTS request_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      route TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_request_metrics_created ON request_metrics(created_at);
    CREATE INDEX IF NOT EXISTS ix_request_metrics_route ON request_metrics(method, route);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      permissions TEXT NOT NULL,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redirects (
      id TEXT PRIMARY KEY,
      from_path TEXT UNIQUE NOT NULL,
      to_path TEXT NOT NULL,
      status_code INTEGER DEFAULT 301,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS podcasts (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      cover_image TEXT,
      author TEXT,
      owner_name TEXT,
      owner_email TEXT,
      language TEXT NOT NULL DEFAULT 'zh-CN',
      category TEXT,
      explicit INTEGER NOT NULL DEFAULT 0,
      link TEXT,
      apple_url TEXT,
      spotify_url TEXT,
      copyright TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT
    );

    CREATE TABLE IF NOT EXISTS podcast_episodes (
      id TEXT PRIMARY KEY,
      podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      guid TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      show_notes TEXT,
      transcript TEXT,
      audio_url TEXT NOT NULL,
      audio_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      audio_size INTEGER NOT NULL DEFAULT 0,
      duration INTEGER,
      cover_image TEXT,
      episode_number INTEGER,
      season_number INTEGER,
      episode_type TEXT NOT NULL DEFAULT 'full',
      explicit INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      published_at INTEGER,
      external_source TEXT,
      external_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_episode_external ON podcast_episodes(external_source, external_id);
    CREATE INDEX IF NOT EXISTS ix_episode_podcast ON podcast_episodes(podcast_id);

    CREATE TABLE IF NOT EXISTS podcast_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      podcast_id TEXT NOT NULL,
      episode_id TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_podcast_events_created ON podcast_events(created_at);
    CREATE INDEX IF NOT EXISTS ix_podcast_events_episode ON podcast_events(event_type, episode_id, created_at);
    CREATE INDEX IF NOT EXISTS ix_podcast_events_podcast ON podcast_events(event_type, podcast_id, created_at);

    CREATE TABLE IF NOT EXISTS share_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      target TEXT NOT NULL,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_share_events_created ON share_events(created_at);
    CREATE INDEX IF NOT EXISTS ix_share_events_target ON share_events(target, created_at);

    CREATE TABLE IF NOT EXISTS episode_feedback (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
      reaction TEXT,
      category TEXT NOT NULL,
      note TEXT,
      listener TEXT,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_feedback_episode ON episode_feedback(episode_id);
    CREATE INDEX IF NOT EXISTS ix_feedback_created ON episode_feedback(created_at);

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT,
      icon TEXT,
      description TEXT,
      app_store_url TEXT,
      app_store_id TEXT,
      bundle_id TEXT,
      platform TEXT NOT NULL DEFAULT 'iOS',
      price TEXT,
      rating REAL,
      rating_count INTEGER,
      accent_color TEXT,
      features TEXT,
      screenshots TEXT,
      links TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER DEFAULT 0,
      published_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT,
      category TEXT,
      version TEXT,
      release_date INTEGER,
      current_version_release_date INTEGER,
      minimum_os_version TEXT,
      subtitle TEXT,
      whats_new TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      last_synced_at INTEGER
    );
  `);

  // Idempotent ALTER for apps table (handles existing production tables without new columns)
  const appCols = new Set(
    (sqlite.prepare("PRAGMA table_info(apps)").all() as { name: string }[]).map(c => c.name)
  );
  const addCol = (name: string, ddl: string) => {
    if (!appCols.has(name)) sqlite.exec(`ALTER TABLE apps ADD COLUMN ${ddl};`);
  };
  addCol('category', 'category TEXT');
  addCol('version', 'version TEXT');
  addCol('release_date', 'release_date INTEGER');
  addCol('current_version_release_date', 'current_version_release_date INTEGER');
  addCol('minimum_os_version', 'minimum_os_version TEXT');
  addCol('subtitle', 'subtitle TEXT');
  addCol('whats_new', 'whats_new TEXT');
  addCol('featured', 'featured INTEGER NOT NULL DEFAULT 0');
  addCol('last_synced_at', 'last_synced_at INTEGER');

  // Idempotent ALTER for page_views.country (existing prod tables predate geo).
  const pageViewCols = new Set(
    (sqlite.prepare("PRAGMA table_info(page_views)").all() as { name: string }[]).map(c => c.name)
  );
  if (!pageViewCols.has('country')) {
    sqlite.exec('ALTER TABLE page_views ADD COLUMN country TEXT;');
  }
  if (!pageViewCols.has('visitor_id')) {
    sqlite.exec('ALTER TABLE page_views ADD COLUMN visitor_id TEXT;');
  }

  // country is added by the ALTER above on legacy DBs; index it only now that the
  // column is guaranteed to exist (a CREATE INDEX on it inside the main exec above
  // would throw "no such column: country" on a pre-geo prod DB and abort boot).
  sqlite.exec('CREATE INDEX IF NOT EXISTS ix_page_views_country ON page_views(country);');

  // Idempotent ALTER for podcasts platform-link columns (existing prod tables predate them).
  const podcastCols = new Set(
    (sqlite.prepare("PRAGMA table_info(podcasts)").all() as { name: string }[]).map(c => c.name)
  );
  if (!podcastCols.has('apple_url')) {
    sqlite.exec('ALTER TABLE podcasts ADD COLUMN apple_url TEXT;');
  }
  if (!podcastCols.has('spotify_url')) {
    sqlite.exec('ALTER TABLE podcasts ADD COLUMN spotify_url TEXT;');
  }

  // Issue #2: enforce App Store ID uniqueness so concurrent /discover cannot
  // SELECT-miss then both INSERT a duplicate app row. SQLite treats NULLs as
  // distinct, so manually-created apps without an App Store ID stay allowed.
  // If a legacy DB already holds duplicates the CREATE throws — dedup (keep the
  // earliest row per app_store_id) and retry, so boot never fails on old data.
  const createAppStoreIdIndex = () =>
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_apps_app_store_id ON apps(app_store_id);');
  try {
    createAppStoreIdIndex();
  } catch {
    const removed = sqlite
      .prepare(
        `DELETE FROM apps
         WHERE app_store_id IS NOT NULL
           AND rowid NOT IN (
             SELECT MIN(rowid) FROM apps WHERE app_store_id IS NOT NULL GROUP BY app_store_id
           )`
      )
      .run();
    console.warn(
      `[db] Removed ${removed.changes} duplicate app row(s) (kept earliest per app_store_id) before adding ux_apps_app_store_id`
    );
    createAppStoreIdIndex();
  }
}
