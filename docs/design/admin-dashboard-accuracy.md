# Admin dashboard accuracy

This update keeps the existing human console and scoped REST/MCP architecture. It changes reporting and presentation, not content, credentials, permissions or production configuration.

## Human workflow

The dashboard shows stored post totals, published-post count, pending comments across **all** posts, recorded lifetime views and today's recorded views. Recent posts are explicitly labelled by creation time. It links to comment review and Observability rather than duplicating agent operations.

Each source refreshes independently every minute, with a manual refresh and a 15-second request timeout. A successful measured zero remains `0`; an unavailable initial measurement is `—`. Failed refreshes retain the last successful value and visibly mark it stale on the metric card and in the source note. A failed source does not erase other panels. Missing/malformed source timestamps remain unknown. Refresh-generation checks prevent a slower previous range from overwriting the newly selected range.

Navigation and content fit mobile widths; desktop navigation is retained. No new credential, login mechanism or permission scope is introduced.

## Measurement definitions

- **Page views:** recorded browser beacons, excluding recognized bot user agents, consistently across overview, summary and trends. This is not a census of real people: blocked JavaScript/beacons, bot classification and browser identity/IP fallback limit coverage. Source rows are retained unchanged.
- **Estimated visitors:** distinct browser IDs with IP-hash fallback, excluding recognized bots. Unique visitors per bucket are not additive across buckets.
- **Page visits:** the existing API `sessions` field is retained for compatibility. It deduplicates visitor + exact path + fixed 30-minute time bucket; it is not a whole-site session or inactivity-based session.
- **Reporting ranges:** daily uses 30 UTC calendar days including today; weekly uses 84 UTC days with weekly buckets; monthly uses 365 UTC days with monthly buckets. The UI labels these actual ranges. The current day and edge calendar buckets may be partial. Trend queries are bounded to the same window as summaries and zero-fill missing calendar buckets. Known future records are excluded from windowed queries. Ranking requests explicitly pass the selected days; omitted days retain lifetime behavior for existing clients.
- **Referrers:** recorded nonempty referrer hosts, filtered for recognized bots. An empty result does not prove all traffic was direct.
- **Geography:** geolocated page views, not unique visitors. Unknown countries are excluded; GeoIP availability and trusted client-IP forwarding limit coverage.
- **Devices:** recorded pageviews classified by user agent; includes bots and unknown devices, which is explicitly documented.
- **Shares:** share-button clicks only, not confirmed shares or delivery.
- **Podcast:** downloads deduplicate IP + episode + fixed 30-minute bucket, not listening/completion. Trend aggregation now separates download and feed-poll event types. The legacy `subscriberEstimate` response field is retained but displayed/documented as **feed endpoint-days** over seven UTC days (IP + UTC day), not subscribers. Lifetime downloads, selected-window downloads, retained-history clients and lifetime episode rankings have explicit separate range labels.
- **Request metrics:** matched API routes only. The error percentage includes 4xx and 5xx and is labelled accordingly. Zero recorded requests means no latency/error-rate samples. This excludes health checks, observability reads, static uploads and unmatched routes; it is not public-site uptime.
- **System/SEO:** stored database/runtime/build/sync state and local built artifacts, not independently verified public reachability, TLS, backups or search indexing. Published app records may be unlisted. Missing file-size measurements are unavailable rather than zero; legacy idle build status is labelled as no valid build record. The dashboard does not invent a global green health score.

Half-window percentage badges were removed because partial/unequal buckets made them misleading. Low-count chart axes no longer repeat rounded tick values.

## REST and MCP

Existing response bodies and routes remain compatible. The protected `GET /api/comments/counts` uses **comments:read**, matching access to pending comments. Its pending count and system status/MCP use the same service function.

`X-Wordbase-Observation` supplies source, range, UTC timezone, actual computation timestamp, expiry and definition. Timestamps are milliseconds since epoch. Cached results retain their original computation time rather than being labelled newly observed on each fetch. CORS exposes this non-secret response header without changing allowed origins or auth gates.

`observability_query` gains an optional `period` for daily/weekly/monthly trends and respects optional `days` on top-pages/referrers. `analytics_query` uses the same filtered trend service. Both return their existing first text data block plus a second text block carrying measurement metadata from the same service as REST. Existing callers consuming the first data block retain its shape. The MCP catalogue is regenerated from the actual tool descriptors.

## Verification and release boundary

Regression tests exercise real SQLite aggregation at UTC boundaries, old/future exclusion, filled buckets, a pending queue larger than one comment page on an old post, feed/download separation, real cache observation timestamps, REST/MCP data-and-metadata parity and existing scope denial. Browser tests use a clearly labelled local synthetic fixture to exercise zero, unavailable, recovery, retained stale values, date selection and light/dark mobile/desktop presentation. No production credential or private analytics is used for the fixture.

Public-page builds and protected-body/feed/route checks are performed separately. Private evidence is under `.preview/admin-accuracy/`. This work is local and requires a separate production release decision; it does not deploy, change Caddy or alter any credentials.
