/**
 * LOCAL-ONLY seed for request_metrics so the "API requests" section shows real
 * shapes (p50/p95, status mix, per-endpoint). Spreads rows across the last 24h.
 *
 * Run:    npx tsx scripts/seed-requests.ts [count]
 * Remove: DELETE FROM request_metrics WHERE id > <printed boundary>;
 */
import Database from 'better-sqlite3';

const DB_PATH = process.env.WORDBASE_DB_PATH || './data/blog.db';
const TARGET = Number(process.argv[2]) || 700;
const db = new Database(DB_PATH);

const beforeMaxId = (db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM request_metrics').get() as { m: number }).m;

function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}
// log-normal-ish latency in ms within [min,max], skewed low with a long tail
function latency(min: number, max: number): number {
  const t = Math.random() ** 2.2; // skew toward min, occasional tail
  return Number((min + t * (max - min)).toFixed(2));
}

// [method, route, weight, latMin, latMax, errKind] — errKind: 0 none, 4 some 4xx, 5 rare 5xx
const ENDPOINTS: [string, string, number, number, number, number][] = [
  ['POST', '/api/analytics/pageview', 34, 0.3, 6, 0],
  ['GET', '/api/posts', 18, 0.4, 12, 0],
  ['GET', '/api/posts/:idOrSlug', 14, 0.5, 18, 4],
  ['GET', '/api/analytics/overview', 8, 0.6, 9, 0],
  ['GET', '/api/categories', 5, 0.2, 5, 0],
  ['GET', '/api/tags', 4, 0.2, 5, 0],
  ['GET', '/api/apps', 4, 0.5, 14, 0],
  ['GET', '/api/podcasts', 3, 0.4, 10, 0],
  ['GET', '/api/media', 3, 0.6, 20, 0],
  ['POST', '/api/posts', 2, 6, 45, 5],
  ['PUT', '/api/posts/:id', 2, 5, 40, 4],
  ['DELETE', '/api/posts/:id', 1, 4, 25, 0],
];

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const insert = db.prepare(
  'INSERT INTO request_metrics (method, route, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)'
);

let inserted = 0;
const tx = db.transaction(() => {
  for (let i = 0; i < TARGET; i++) {
    const [method, route, , latMin, latMax, errKind] = weighted(
      ENDPOINTS.map((e) => [e, e[2]] as [typeof e, number])
    );
    let status = 200;
    if (errKind === 4 && Math.random() < 0.12) status = Math.random() < 0.7 ? 404 : 400;
    else if (errKind === 5 && Math.random() < 0.06) status = 500;
    else if (method === 'POST' && route === '/api/analytics/pageview') status = 201;

    const createdAt = NOW - Math.floor((Math.random() ** 1.4) * DAY); // skew recent
    insert.run(method, route, status, latency(latMin, latMax), createdAt);
    inserted++;
  }
});
tx();

const agg = db.prepare(
  "SELECT count(*) AS n, sum(status>=400) AS errs, count(DISTINCT method||route) AS endpoints FROM request_metrics WHERE created_at >= ?"
).get(NOW - DAY) as { n: number; errs: number; endpoints: number };

console.log(`Inserted ${inserted} request_metrics rows across ${ENDPOINTS.length} endpoints.`);
console.log(`Cleanup boundary: DELETE FROM request_metrics WHERE id > ${beforeMaxId};`);
console.log(`Last-24h: requests=${agg.n} endpoints=${agg.endpoints} errorRate=${((agg.errs / agg.n) * 100).toFixed(2)}%`);
db.close();
