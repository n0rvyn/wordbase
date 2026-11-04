# Observability: collection evidence and data quality

Status: dashboard and observability release, approved for production. No schema migration, credential or proxy changes. Separate SEO work is excluded.

## Findings from the actual collectors

Audience totals exclude recognized bot user agents, while device counts deliberately retain a bot category. Geography omits unknown countries; referrer rankings omit missing referrers. The previous console did not expose those denominators. Visitor/page-visit estimates exclude rows without either a browser identifier or IP hash. Podcast deduplication excludes requests missing its key. A recent cache refresh did not establish that any new source event had arrived.

API request timing covers matched API routes, not public page delivery. Observability polling, health checks, preflights, uploads and unmatched routes are excluded. Its original query had no upper timestamp bound; it also lacked a whole-sample percentile. Combined 4xx/5xx reporting did not isolate server responses.

## Implemented

### Collection coverage

`GET /api/observability/data-quality?days=30` requires the existing `observability:read` scope. The same service is exposed through `observability_query`, section `data-quality`; the tool remains read-only. No new permission or credential is introduced.

One read transaction and UTC cutoff account for:

- captured beacons = bot-filtered counted views + recognized bot exclusions;
- counted-view rows with browser IDs, IP fallback only or no usable identifier;
- counted-view country/referrer coverage, and missing user agents;
- raw podcast requests missing an IP or episode needed for deduplication;
- raw source event counts within the selected window, plus earliest/latest retained event timestamps and source retention policies;
- whether a GeoIP reader is loaded now, without claiming historical coverage or correct IP forwarding.

The same existing bot predicate powers audience totals and the quality view. Only aggregates are returned: no visitor IDs, IP hashes or raw request logs. Results have the existing 60-second cache and shared observation metadata. Event timestamps remain distinct from cache observation/expiry times. Earliest retained event is not presented as collection start time.

### API timing

Request queries now exclude future-dated records and return additive fields: the exact measurement window, separate client/server response counts, and whole-sample average, median and nearest-rank p95. An empty sample returns `latency: null`. Existing response fields and the combined error rate remain compatible.

Operations shows measured 5xx counts separately from 4xx, with the denominator, and whole-sample p95 rather than deriving a percentile from endpoint averages. Sample-size volatility and API-only scope are visible. An arbitrary 500ms endpoint warning has been removed; no latency SLO has been configured.

### Human review

The Data quality tab explains coverage by event, shows reconciled counts and actual UTC windows, identifies omissions, and offers concrete investigation context. It retains source/freshness details. Audience links directly to collection coverage and explains that unique visitors are not additive across chart buckets. Source definitions are shared with MCP and now explain ranking limits and attribution subsets.

A failed refresh retains a visibly stale snapshot with its original time/range. A fresh failed load says coverage is unavailable. Empty measurement denominators say “No sample”; measured zero remains zero. Mobile tabs form a clear two-column group; the collection timeline is a labelled keyboard-focusable horizontal region.

## Verification and preview

- API full suite: 1,034 tests passed. After adding an authentication check, all six focused quality/timing tests pass. These cover bots, identity/geography/referrer gaps, UTC/future boundaries, empty data, podcast missing keys, MCP data/definition parity, anonymous REST rejection and aggregate percentiles.
- Web suite: 353 tests passed, including zero-versus-no-sample coverage and tab routing. API TypeScript and final Astro checks pass; Astro has zero errors/warnings and six existing hints.
- Final local build: 878 pages. 835 sitemap routes, 60 protected body/link signatures, feeds, seven original user documents and seven artwork hashes preserved.
- Browser: desktop and 390px mobile, light/dark, reporting-window selection, Operations metrics, retained failure, fresh failure and expired snapshot verified. No document horizontal overflow at 390px.

Review: http://127.0.0.1:4417/admin/observability#quality on the Mac. It is explicitly labelled simulated data. For this review, a GET-only loopback fixture calls the actual aggregation services over seeded in-memory SQLite, rather than substituting hand-written coverage numbers. The dataset reconciles 2,254 captured beacons minus 150 bots to 2,104 counted views, including 30 unidentified views. The request sample has 40 rows, one 5xx, three 4xx and a whole-sample p95 of 119ms. These are verification fixtures, not norvyn.com production readings.

Evidence: `.preview/observability-depth/` contains test/check/build logs, service snapshot, public-preservation report, desktop/mobile screenshots and failure-state captures. The source fixture is private local rehearsal material, not shipped product code.

## Limits and remaining decisions

No production observability data or deployment was changed in this task. The new view cannot determine the number of blocked/lost beacons, prove people/listening/subscribers, establish an outage from silence, verify client-IP forwarding, or monitor public reachability/TLS/Caddy/backups. No expected traffic cadence, alert threshold or SLO is configured. API rows are pruned probabilistically after approximately 30 days; podcast feed polls after approximately 90 days, so older windows may be incomplete. Historical records are not backfilled.

Correct client-IP forwarding, live GeoIP availability, ingestion failures outside the captured dataset and external uptime monitoring require their own evidence. Any Caddy configuration change remains an owner-applied manual operation. None is required by this local feature.
