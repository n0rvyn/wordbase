# Article observability and honest coverage

Status: dashboard and observability release, approved for production. No schema migration, credential or proxy changes. Separate SEO work is excluded.

## Questions the console answers

Articles is a new view at `/admin/observability#posts`. It shows all published articles, including those with zero captured views, with search, ordering and a bounded selector. Selecting an article reveals:

- counted page loads, estimated visitors and recorded share-button clicks;
- activity in the selected UTC buckets and the latest captured article view;
- default versus English-route views, with known historical-alias views identified as a subset;
- identifier coverage, missing identifiers and excluded recognized bots;
- referrer coverage and the top five recorded hosts;
- optional, explicitly qualified country coverage.

Article selection brings the details into view on mobile. A search with no matches clears the detail. The date range and original source time remain visible, including when a refresh fails. Captured views with no usable identifier show an unavailable visitor estimate instead of a misleading zero. Page loads do not establish completed reads; route language does not establish translation; share clicks do not establish completed sharing.

## Shared measurement implementation

`GET /api/observability/posts?days=30&period=daily` uses the existing `observability:read` scope. MCP `observability_query`, section `post-metrics`, uses the same service and observation definitions. No new permission is introduced. The response is an aggregate snapshot, with no visitor IDs or IP hashes.

An exact article resolver is shared by article measurements, the existing per-post endpoint and rankings. It combines default/English article paths, percent encoding, `.html` variants and known internal redirect mappings. It rejects external/cyclic aliases, taxonomy/system routes and protected published companion paths. Similar slug prefixes cannot inflate another article. Current article/redirect mappings govern historical attribution; unresolvable article-route views are reported separately.

`/api/analytics/posts/:id` retains its response shape, now uses exact bot-filtered matching, and accepts an optional `days` window. Its default remains recorded history. Article rankings exclude future-dated events. No URL or redirect record is changed.

Visitor estimates deduplicate across article variants within the selected window. View buckets sum to the article total; unique visitors must not be summed across buckets. Stored content status and publication dates are distinct from observed activity.

## Identity and geography

Future ingestion normalizes the first supplied forwarded address consistently with GeoIP, and leaves missing, invalid, private or loopback addresses unidentified. This normalization does not verify proxy trust. Unknown/empty user-agent values become unknown devices rather than desktop.

Historical records remain untouched. Read queries recognize common unknown/loopback hash sentinels and exclude them from identifier and podcast-deduplication estimates. Browser IDs still count independently. Other historical proxy-derived hashes cannot be validated or recovered from the stored hash.

Data quality now separates browser identification from structurally usable IP-key coverage. A complete browser-ID count cannot establish location coverage. Geography stays secondary and explicitly IP-derived; an empty region display says country data is unavailable, not that there were no visitors. No infrastructure repair is attempted or proposed by this implementation. Private operational read-only evidence is retained only under ignored `.preview/post-observability/` and is not source intended for publication.

Raw podcast requests remain captured when identification is absent. Deduplicated totals may decrease when common unusable legacy IP keys are excluded; the console labels identifiable requests and flags a missing IP sample. No listening/subscriber count is invented, and no source rows are deleted or rewritten.

## Verification

- 1,044 API tests passed across 68 files. Final focused checks: 20 passed, including the added IP-coverage fields.
- 353 web tests passed. API TypeScript and Astro checks are clean; Astro has zero errors/warnings and six existing hints.
- Final local build renders 878 pages. Public verification preserves 835 sitemap routes, 60 protected body/link signatures, blog/podcast feeds, seven original user documents and seven artwork hashes.
- Tests cover exact and encoded paths, aliases, prefix/taxonomy collisions, zero-view articles, UTC boundaries, future timestamps, cross-route identity deduplication, authenticated REST/MCP parity, missing and historical sentinel identifiers, unknown-device classification and unidentified podcast requests.
- Browser review covers search, sorting, no-match and zero-view states, 30/84-day windows, mobile selection/scrolling, light/dark, retained refresh failures, fresh unavailable sources and separate browser/IP coverage. No document horizontal overflow at 390px.

## Review and limits

Preview: http://127.0.0.1:4417/admin/observability#posts on the Mac. It uses real published article titles/routes from the existing read-only content preview and clearly labelled synthetic events in in-memory SQLite, queried through the actual aggregation services. Screenshots and logs are under `.preview/post-observability/`.

No real production counts are represented by the synthetic charts. Received-event coverage cannot measure blocked/lost beacons, prove people or reading completion, recover historical locations, or monitor external uptime. Host/proxy services remain outside the work. Production and release authorization are separate from this completed local review.
