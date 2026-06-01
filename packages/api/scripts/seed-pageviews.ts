/**
 * LOCAL-ONLY seed for page_views so the observability panel shows real shapes.
 * Backdates created_at across the last 90 days, with repeat hits inside 30-min
 * windows so deduplicated "sessions" come out below raw page views.
 *
 * Run:    npx tsx scripts/seed-pageviews.ts [count]
 * Remove: DELETE FROM page_views WHERE id > <printed boundary>;
 */
import Database from 'better-sqlite3';
import { createHash } from 'crypto';

const DB_PATH = process.env.WORDBASE_DB_PATH || './data/blog.db';
const TARGET = Number(process.argv[2]) || 1500;

const db = new Database(DB_PATH);

const beforeMaxId = (db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM page_views').get() as { m: number }).m;

const slugs = (db.prepare("SELECT slug FROM posts WHERE status='published'").all() as { slug: string }[]).map((r) => r.slug);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
// weighted pick: items is [value, weight][]
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    if ((r -= w) <= 0) return v;
  }
  return items[items.length - 1][0];
}
function ipHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

// ~90 distinct synthetic visitors
const VISITORS = Array.from({ length: 90 }, (_, i) => ipHash(`seed-visitor-${i}`));

const USER_AGENTS: [string, number][] = [
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 22],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 24],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36', 8],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 20],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 10],
  ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 5],
  ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 3],
];

const REFERRERS: [string | null, number][] = [
  [null, 40], // direct
  ['https://www.google.com/', 24],
  ['https://t.co/', 9],
  ['https://github.com/', 8],
  ['https://www.bing.com/', 5],
  ['https://duckduckgo.com/', 4],
  ['https://news.ycombinator.com/', 5],
  ['https://norvyn.com/writing', 5],
];

const STATIC_PATHS: [string, number][] = [
  ['/', 14],
  ['/writing', 8],
  ['/apps', 5],
  ['/podcast', 4],
  ['/about', 3],
  ['/archives', 2],
];

function randomPath(): string {
  // 64% a post, otherwise a static page
  if (slugs.length > 0 && Math.random() < 0.64) {
    return `/posts/${pick(slugs)}`;
  }
  return weighted(STATIC_PATHS);
}

const NOW = Math.floor(Date.now() / 1000);
const NINETY_DAYS = 90 * 86400;

const insert = db.prepare(
  'INSERT INTO page_views (path, referrer, user_agent, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)'
);

let inserted = 0;
const tx = db.transaction(() => {
  while (inserted < TARGET) {
    const visitor = pick(VISITORS);
    const ua = weighted(USER_AGENTS);
    const referrer = weighted(REFERRERS);

    // Session start: skew toward recent days (square gives more weight near 0 = now)
    const ageFrac = Math.random() ** 2; // 0 = now, 1 = 90 days ago
    const sessionStart = NOW - Math.floor(ageFrac * NINETY_DAYS);

    // 1–6 hits in this session, several repeats inside the 30-min window so
    // sessions < pageviews after read-side dedup.
    const hits = 1 + Math.floor(Math.random() * 6);
    const landing = randomPath();
    for (let h = 0; h < hits && inserted < TARGET; h++) {
      // 55% chance the hit is to the landing path (a refresh / re-read), else a new path
      const path = Math.random() < 0.55 ? landing : randomPath();
      const offset = Math.floor(Math.random() * 1800); // within the 30-min window
      insert.run(path, referrer, ua, visitor, sessionStart + offset);
      inserted++;
    }
  }
});
tx();

const after = db.prepare(
  "SELECT count(*) AS pv, count(distinct ip_hash) AS uniq, count(distinct ip_hash || '|' || path || '|' || (created_at/1800)) AS sessions FROM page_views WHERE created_at >= ?"
).get(NOW - 30 * 86400) as { pv: number; uniq: number; sessions: number };

console.log(`Inserted ${inserted} page_views rows.`);
console.log(`Cleanup boundary: DELETE FROM page_views WHERE id > ${beforeMaxId};`);
console.log(`Last-30-day check -> pageViews=${after.pv} uniqueVisitors=${after.uniq} sessions=${after.sessions}`);
console.log(`Invariant pv >= sessions >= unique: ${after.pv >= after.sessions && after.sessions >= after.uniq ? 'OK' : 'VIOLATED'}`);

db.close();
