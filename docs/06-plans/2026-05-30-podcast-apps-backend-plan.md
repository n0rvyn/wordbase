---
type: plan
status: active
contract_version: 2
tags: [podcast, apps, drizzle, hono, mcp, rss, vitest]
refs: [docs/design/backend-data-model.md]
---

# Podcast + Apps Backend Implementation Plan

**Goal:** Add backend support (DB tables, services, REST routes, RSS feed, MCP tools, full unit tests) for podcast shows/episodes and iOS app landing pages, so Adam and the AI can create/publish them through the API, with publishing auto-rebuilding the static site.

**Architecture:** Three new SQLite tables (`podcasts`, `podcast_episodes`, `apps`) declared in BOTH `schema.ts` (Drizzle typing) and `db/index.ts` (raw `CREATE TABLE IF NOT EXISTS`, the project's actual table-creation mechanism). Each entity gets a plain-function service + a Hono router mounted in `app.ts`, mirroring `post.service.ts` / `routes/posts.ts`. Episodes ingest idempotently via upsert on `(external_source, external_id)` for Adam re-delivery. A hand-built RSS XML endpoint per show emits a valid Apple Podcasts iTunes feed. Audio is self-hosted through the existing media upload pipeline, extended for a larger audio size cap. Rendering stays **static (Astro SSG)**; publish endpoints (posts + podcasts + apps) auto-trigger `build.service.triggerBuild()` so content appears within seconds while the site stays up even if the DB is down. A vitest harness with an env-configurable DB path enables full service-level unit tests.

**Tech Stack:** TypeScript, Drizzle ORM (better-sqlite3), Hono, nanoid, `@modelcontextprotocol` server, **vitest** (new).

**Design doc:** docs/design/backend-data-model.md (locked 2026-05-30)

**Design analysis:** not applicable

**Crystal file:** not applicable

**Bug diagnosis:** not applicable

**Threat model:** included (keywords: validate, token, credential via API auth + external input into RSS XML)

**Pre-flight risks:**
- `media.service.ts:9` `MAX_FILE_SIZE = 10MB` blocks self-hosted podcast mp3s. Shared with image upload — fix must keep 10MB default for existing callers (Task 3).
- No XML library → RSS built by hand-string with strict escaping of every dynamic value (Task 7).
- Tables are created by raw SQL in `db/index.ts` on boot, NOT drizzle migrations (Task 1).
- Services bind to a singleton DB at `./data/blog.db` (`db/index.ts:5`) → unit tests need an env-configurable path; Task 2 adds `WORDBASE_DB_PATH` (default unchanged) so tests use a throwaway DB.
- KB lesson 2026-05-24 (mcp-tool-descriptions-need-user-phrasing-maps): MCP tool descriptions must use natural user phrasing (Task 9).
- Consistency change: posts currently don't auto-rebuild on publish (`routes/posts.ts:48`); per DP-002 this plan makes posts publish also auto-trigger build (Task 8).

---

## Impact Map

**User path:** New public read endpoints for podcasts/episodes/apps + per-show `feed.xml`; authenticated write/publish endpoints. Publish (posts/podcasts/apps) → background site rebuild → content live in seconds. Consumed later by frontend + Adam's adapter.
**Data path:** Adam adapter / admin / MCP → API route → service → SQLite (3 new tables) + `/uploads` blobs. Publish → `build.service.triggerBuild()`.
**Shared surfaces:** `db/index.ts` (tables + env DB path), `db/schema.ts`, `app.ts` (mount routers), `mcp/tools.ts` (register tools), `media.service.ts` (size-cap override), `routes/posts.ts` (publish → build trigger), `package.json` (vitest).
**Existing consumers:** `media.service.uploadMedia` (media route + `blog_upload_media`) — preserve 10MB default. `mcp/tools.ts registerTools()` (mcp/server.ts) — appended tools only. `routes/posts.ts` publish — behavior change (adds rebuild) is authorized by DP-002.
**Must remain unchanged:** posts/pages/categories/tags/comments/media DATA behavior; image upload 10MB default; existing MCP tools; route error shape `{ error: { code, message } }`; default DB path `./data/blog.db`.
**Regression checks:** `tsc --noEmit` clean; full `vitest run` green; existing image upload still rejects >10MB without override; `/api/posts` CRUD unchanged (route tests); existing MCP tools still registered; booting with no `WORDBASE_DB_PATH` still opens `./data/blog.db`.

---

## Threat Model

**Attack surface:**
- Audio/cover upload → oversized-file DoS. Mitigation: explicit max cap (env default 200MB), no unbounded uploads (Task 3/5).
- Dynamic values in RSS XML (title, show notes, author, urls) → XML injection / malformed feed. Mitigation: escape `& < > " '` on every interpolated element/attribute value; show notes are CDATA-wrapped AND any `]]>` sequence inside them is split (`]]]]><![CDATA[>`) so the CDATA can't be terminated early; urls attribute-encoded (Task 7). Note: CDATA alone is NOT safe without `]]>` neutralization.
- `external_id`/`external_source` from Adam → parameterized Drizzle (no injection); validate both non-empty before upsert (Task 5).

**Failure modes:**
- Auth gate on write/publish fails → deny (reuse existing `authMiddleware`, default-deny proven on posts). No new auth logic.
- Upload exceeds cap → throw + 4xx, never partial-write (size checked before `writeFile`, as existing `uploadMedia`).
- `triggerBuild` failure → already isolated (catches internally, sets build state `failed`); publish still succeeds (fire-and-forget). Acceptable: content is in DB/API, a later build picks it up.

**Resource lifecycle:**
- Audio upload writes a file to `/uploads`. Success: persists. Error: no DB row, no partial file (size pre-check). Delete: episode delete does NOT delete the blob (matches media semantics; Task 5 non-goal).
- Test DBs: vitest setup opens a temp/in-memory DB; closed/discarded on run end (Task 2).

**Input validation requirements:**
- RSS route: escape every field; `Content-Type: application/rss+xml; charset=utf-8` (Task 7).
- Episode create/upsert: `audioUrl` required non-empty; `audioSize`/`duration` → integers ≥ 0 (Task 5).
- App create: `features`/`screenshots`/`links` must parse as JSON array/object; reject malformed with 400 (Task 6).

---

## Decisions

### [DP-001] Test framework for the API package (recommended)

**Context:** The API package has no test runner. Adding one is net-new infra.
**Options:**
- A: Defer tests; verify via `tsc` + live curl. — fastest; logic regressions caught only by curl.
- B: Add `vitest` + full unit tests for service logic now. — better safety; adds setup; first test infra for the repo.
**Chosen:** Option B — full vitest suite; user requested comprehensive tests. Requires env-configurable DB path (Task 2).

### [DP-002] Site rebuild on publish (recommended)

**Context:** Static site (Astro SSG) needs a rebuild for published content to appear on public HTML. Posts currently rebuild only via a separate `/api/build` call.
**Options:**
- A: Podcast/app publish auto-rebuild; posts unchanged. — divergent behavior across content types.
- B: Match posts (manual rebuild via separate call). — Adam needs an extra call; content invisible until then.
- C: All publish (posts + podcasts + apps) auto-rebuild; site-wide consistency. — changes existing post publish behavior (authorized).
**Chosen:** Option C — user confirmed site-wide consistency; publish on every content type fire-and-forget triggers `triggerBuild()` (guarded against concurrency at `build.service.ts:28`). Keeps static-site resilience (DB down ≠ site down) with WordPress-like "publish → appears in seconds".

---

<!-- section: task-1 keywords: schema, db-index, podcasts, episodes, apps -->
### Task 1: Schema — add `podcasts`, `podcast_episodes`, `apps` tables

⚠️ No test: pure schema declaration (DDL + Drizzle typing); verified by boot + table-existence check, not unit logic.

**Maps to Impact Map:** Data path, Shared surfaces (db/schema.ts, db/index.ts)

**Files:**
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/api/src/db/index.ts`

**Expected outcome:** Booting the API creates the three tables per design doc; Drizzle types `Podcast`, `PodcastEpisode`, `App` (+ `New*`) are exported.

**Non-goals:** No drizzle-kit migration; no changes to existing tables.

**Touched surface:** `db/schema.ts`, `db/index.ts`.

**Regression shield:** Existing 12 tables' DDL untouched.

**Task Contract:**
- Expected behavior: After restart, the database has podcast and app tables ready; nothing the reader sees changes yet.
- Automated verify: `cd packages/api && npx tsc --noEmit` clean; sqlite check lists all 3 tables (command below).
- Real path verify: boot the API, run the sqlite check.
- Manual/device verify: none.

**Steps:**
1. `schema.ts` import: `import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';`
2. Add `podcasts`, `podcastEpisodes`, `apps` defs per design doc §1–§3 (incl. `uniqueIndex('ux_episode_external')` on `(externalSource, externalId)` and `index('ix_episode_podcast')` on `podcastId`).
3. Add Type exports: `Podcast`/`NewPodcast`, `PodcastEpisode`/`NewPodcastEpisode`, `App`/`NewApp`.
4. `db/index.ts`: append three `CREATE TABLE IF NOT EXISTS` blocks (snake_case columns), with `podcast_id ... REFERENCES podcasts(id) ON DELETE CASCADE`, plus `CREATE UNIQUE INDEX IF NOT EXISTS ux_episode_external ON podcast_episodes(external_source, external_id);` and `CREATE INDEX IF NOT EXISTS ix_episode_podcast ON podcast_episodes(podcast_id);`.
   - **DDL parity (required):** The design doc shows only Drizzle blocks. Drizzle `.default()`/`.notNull()` are NOT injected at insert time by this project (no drizzle-kit; tables come from this raw SQL). So the hand-written DDL MUST reproduce every `NOT NULL` and `DEFAULT` column-for-column, or an omitted-column insert gets NULL. Enumerate explicitly: `podcasts`: `slug TEXT UNIQUE NOT NULL`, `title TEXT NOT NULL`, `language TEXT NOT NULL DEFAULT 'zh-CN'`, `explicit INTEGER NOT NULL DEFAULT 0`, `status TEXT NOT NULL DEFAULT 'draft'`, `sort_order INTEGER DEFAULT 0`, `created_at/updated_at INTEGER NOT NULL`. `podcast_episodes`: `audio_type TEXT NOT NULL DEFAULT 'audio/mpeg'`, `audio_size INTEGER NOT NULL DEFAULT 0`, `episode_type TEXT NOT NULL DEFAULT 'full'`, `status TEXT NOT NULL DEFAULT 'draft'`, `audio_url TEXT NOT NULL`, `guid TEXT NOT NULL`, `slug TEXT NOT NULL`, `title TEXT NOT NULL`, `created_at/updated_at INTEGER NOT NULL`. `apps`: `platform TEXT NOT NULL DEFAULT 'iOS'`, `status TEXT NOT NULL DEFAULT 'draft'`, `sort_order INTEGER DEFAULT 0`, `name TEXT NOT NULL`, `slug TEXT NOT NULL`, `created_at/updated_at INTEGER NOT NULL`.
   - **Default source-of-truth:** to keep behavior deterministic regardless of DDL, the services (Task 4-impl/5-impl/6-impl) set these defaults explicitly at insert (service-set); the DDL defaults are a safety net. The `audioType='audio/mpeg'` / `episodeType='full'` / `status='draft'` test assertions therefore verify service-set values.

**Verify:**
Run: `cd packages/api && npx tsc --noEmit && grep -c "CREATE TABLE IF NOT EXISTS" src/db/index.ts`
Expected: tsc 0; count 12 → 15.
<!-- /section -->

<!-- section: task-2 keywords: vitest, test-harness, db-path, env -->
### Task 2: Test harness — vitest + env-configurable DB path

<!-- no-split: test-infra setup, not test-first logic; produces config + a small db.ts edit -->

**Maps to Impact Map:** Shared surfaces (db/index.ts, package.json), Regression checks

**Files:**
- Modify: `packages/api/src/db/index.ts` (read `WORDBASE_DB_PATH`)
- Modify: `packages/api/package.json` (add vitest + `test` script)
- Create: `packages/api/vitest.config.ts`
- Create: `packages/api/src/__tests__/setup.ts`
- Create: `packages/api/src/__tests__/helpers.ts`

**Expected outcome:** `pnpm test` runs vitest against a throwaway DB; default runtime DB path is unchanged when the env var is absent.

**Non-goals:** No CI wiring; no e2e/browser tests.

**Touched surface:** `db/index.ts:5` (path), `package.json` scripts/devDeps.

**Regression shield:** `new Database(process.env.WORDBASE_DB_PATH || './data/blog.db')` — absent env ⇒ identical to today.

**Task Contract:**
- Expected behavior: Developers can run the test suite; production DB location is unaffected.
- Automated verify: `cd packages/api && WORDBASE_DB_PATH=':memory:' npx vitest run` exits 0 with the placeholder test passing; `node -e "console.log(process.env.WORDBASE_DB_PATH||'./data/blog.db')"` shows default when unset.
- Real path verify: boot API with no env var → still opens `./data/blog.db` (existing data served).
- Manual/device verify: none.

**Steps:**
1. `db/index.ts`: change line 5 to `const sqlite = new Database(process.env.WORDBASE_DB_PATH || './data/blog.db');`.
2. `package.json`: add devDep `vitest`; add script `"test": "vitest run"`, `"test:watch": "vitest"`.
3. `vitest.config.ts`: set `test.environment='node'`, `test.setupFiles=['./src/__tests__/setup.ts']`, and `test.env={ WORDBASE_DB_PATH: ':memory:' }` so the singleton opens in-memory before any service import.
4. `setup.ts`: `import { initializeDatabase } from '../db/index.js'; initializeDatabase();` (creates all tables incl. the 3 new ones in the in-memory DB once per worker).
5. `helpers.ts`: export `resetNewTables()` that `db.delete(...)` from `podcastEpisodes`, `podcasts`, `apps` (FK order) for per-test isolation; export small factory builders.
6. Add a placeholder `src/__tests__/sanity.test.ts` asserting `initializeDatabase` ran and the 3 tables exist (`sqlite_master` query) — proves harness wiring.

**Verify:**
Run: `cd packages/api && WORDBASE_DB_PATH=':memory:' npx vitest run src/__tests__/sanity.test.ts`
Expected: 1 file, tests pass.
<!-- /section -->

<!-- section: task-3-tests keywords: media-service, upload, maxSize, vitest -->
### Task 3-tests: media upload size-cap override (tests)

**Maps to Impact Map:** Shared surfaces (media.service.ts), Existing consumers, Must remain unchanged

**Files:**
- Create: `packages/api/src/__tests__/media.size.test.ts`

**Expected outcome:** Failing tests pin the contract: default cap stays 10MB; an explicit larger `maxSize` allows bigger files; `podcastAudioMaxBytes()` honors env.

**Task Contract:**
- Expected behavior: A large audio file is allowed only when the higher cap is used; normal uploads remain capped at 10MB.
- Automated verify: `npx vitest run src/__tests__/media.size.test.ts` FAILS (e.g. "podcastAudioMaxBytes is not a function" / no `maxSize` honored) before Task 3-impl.
- Real path verify: n/a (unit).
- Manual/device verify: none.

**Steps:**
1. Test: uploading an 11MB buffer with no `maxSize` throws "File too large".
2. Test: uploading an 11MB buffer with `maxSize: 50*1024*1024` succeeds (returns record with `url`).
3. Test: `podcastAudioMaxBytes()` returns `200*1024*1024` by default and respects `PODCAST_MAX_AUDIO_MB`.
4. Use a temp uploads dir or assert via thrown error to avoid large disk writes where possible.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/media.size.test.ts`
Expected: tests FAIL (impl not present) — confirms test-first.
<!-- /section -->

<!-- section: task-3-impl keywords: media-service, upload, maxSize -->
### Task 3-impl: media upload size-cap override (impl)

**Depends on:** Task 3-tests

**Maps to Impact Map:** Shared surfaces (media.service.ts), Existing consumers

**Files:**
- Modify: `packages/api/src/services/media.service.ts`

**Expected outcome:** `uploadMedia` honors optional `maxSize` (default 10MB); `podcastAudioMaxBytes()` exported.

**Regression shield:** Do not modify the test files written in Task 3-tests. Existing callers (no `maxSize`) stay at 10MB.

**Task Contract:**
- Expected behavior: same user-visible outcome as Task 3-tests.
- Automated verify: `npx vitest run src/__tests__/media.size.test.ts` PASSES.
- Real path verify: exercised via Task 5 audio upload.
- Manual/device verify: none.

**Steps:**
1. Add `maxSize?: number` to `UploadOptions`.
2. `const limit = options.maxSize ?? MAX_FILE_SIZE;` and throw using `limit` when exceeded.
3. `export function podcastAudioMaxBytes(): number { return parseInt(process.env.PODCAST_MAX_AUDIO_MB || '200', 10) * 1024 * 1024; }`.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/media.size.test.ts && npx tsc --noEmit`
Expected: green; tsc 0.
<!-- /section -->

<!-- section: task-4-tests keywords: podcast-service, shows, crud, vitest -->
### Task 4-tests: podcast show service (tests)

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/api/src/__tests__/podcast.service.test.ts`

**Expected outcome:** Failing tests pin show CRUD + publish + slug/default behavior.

**Task Contract:**
- Expected behavior: Creating a show defaults language `zh-CN`/status `draft`; publish flips to published; get works by id and slug.
- Automated verify: `npx vitest run src/__tests__/podcast.service.test.ts` FAILS before 4-impl.
- Real path verify: n/a (unit).
- Manual/device verify: none.

**Steps:**
1. `beforeEach(resetNewTables)`.
2. Tests: create→returns row with slug, `language='zh-CN'`, `status='draft'`; `getPodcast` by id and by slug; `updatePodcast` partial; `publishPodcast` sets `status='published'`; `listPodcasts` filters by status.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/podcast.service.test.ts`
Expected: FAIL (service absent).
<!-- /section -->

<!-- section: task-4-impl keywords: podcast-service, shows, crud, publish -->
### Task 4-impl: podcast show service (impl)

**Depends on:** Task 4-tests

**Files:**
- Create: `packages/api/src/services/podcast.service.ts`

**Expected outcome:** `listPodcasts/getPodcast/createPodcast/updatePodcast/deletePodcast/publishPodcast` per `post.service.ts` conventions.

**Regression shield:** Do not modify Task 4-tests files.

**Task Contract:**
- Expected behavior: same as Task 4-tests.
- Automated verify: `npx vitest run src/__tests__/podcast.service.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: via Task 8 routes.
- Manual/device verify: none.

**Steps:**
1. Mirror `post.service.ts` (nanoid id, `Math.floor(Date.now()/1000)`, CJK `slugify`).
2. Defaults: language `'zh-CN'`, explicit 0, status `'draft'`. `publishPodcast` sets status+updatedAt (no publishedAt column).

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/podcast.service.test.ts && npx tsc --noEmit`
Expected: green.
<!-- /section -->

<!-- section: task-5-tests keywords: episode-service, upsert, external, audio, vitest -->
### Task 5-tests: episode service — upsert idempotency + audio (tests)

**Maps to Impact Map:** Data path, Shared surfaces (media.service)

**Files:**
- Create: `packages/api/src/__tests__/episode.service.test.ts`

**Expected outcome:** Failing tests pin the key behaviors: create requires `audioUrl`; `upsertEpisodeByExternal` is idempotent on `(external_source, external_id)`; publish sets publishedAt.

**Task Contract:**
- Expected behavior: Sending the same external episode twice yields ONE row reflecting the latest content; missing audioUrl rejected.
- Automated verify: `npx vitest run src/__tests__/episode.service.test.ts` FAILS before 5-impl.
- Real path verify: n/a (unit) + Task 8 for audio upload.
- Manual/device verify: none.

**Steps:**
1. `beforeEach(resetNewTables)`; create a parent show via podcast.service.
2. Tests: `createEpisode` without `audioUrl` throws; with audioUrl returns row (`guid` defaults to id, `audioType='audio/mpeg'`, `episodeType='full'`).
3. `upsertEpisodeByExternal` twice with same `externalId` → `listEpisodes(show)` length 1, title == latest, returns `{created:false}` second time.
4. `upsertEpisodeByExternal` with empty `externalId` throws.
5. `publishEpisode` sets `status='published'` and numeric `publishedAt`.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/episode.service.test.ts`
Expected: FAIL.
<!-- /section -->

<!-- section: task-5-impl keywords: episode-service, upsert, audio-upload, publish -->
### Task 5-impl: episode service (impl)

**Depends on:** Task 5-tests

**Files:**
- Create: `packages/api/src/services/episode.service.ts`

**Expected outcome:** Episode CRUD + `upsertEpisodeByExternal` (idempotent) + `uploadEpisodeAudio` (uses `uploadMedia` with `podcastAudioMaxBytes()`).

**Regression shield:** Do not modify Task 5-tests files. Use `uploadMedia` with explicit `maxSize` only (no media-default change).

**Task Contract:**
- Expected behavior: same as Task 5-tests; plus a >10MB mp3 uploads and returns `{url,size}`.
- Automated verify: `npx vitest run src/__tests__/episode.service.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: Task 8 audio-upload curl.
- Manual/device verify: none.

**Steps:**
1. Imports incl. `import { uploadMedia, podcastAudioMaxBytes } from './media.service.js'`.
2. `listEpisodes(podcastId,{status,page,limit})` (filter by podcastId, order `desc(createdAt)`), `getEpisode(idOrSlug)`.
3. `createEpisode(podcastId,data)`: require non-empty `audioUrl`; `guid=data.guid||id`; coerce `audioSize` (default 0) / `duration` to int. Set defaults EXPLICITLY in the insert (service-set, not relying on DDL): `audioType: data.audioType || 'audio/mpeg'`, `episodeType: data.episodeType || 'full'`, `status: data.status || 'draft'`, `slug: data.slug || slugify(title) || id`.
4. `updateEpisode`, `deleteEpisode`, `publishEpisode` (status+publishedAt+updatedAt).
5. `upsertEpisodeByExternal(podcastId,{externalSource,externalId,...data})`: validate both non-empty; select by both; update existing or create; return row + `{created}`.
6. `uploadEpisodeAudio({filename,base64,mimeType})`: build `file` shim (as `blog_upload_media`), `uploadMedia({file, maxSize: podcastAudioMaxBytes()})`, return `{url,size,mimeType}`.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/episode.service.test.ts && npx tsc --noEmit`
Expected: green.
<!-- /section -->

<!-- section: task-6-tests keywords: app-service, json, validation, vitest -->
### Task 6-tests: app service — JSON blocks (tests)

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/api/src/__tests__/app.service.test.ts`

**Expected outcome:** Failing tests pin CRUD + JSON validation of `features/screenshots/links` + publish.

**Task Contract:**
- Expected behavior: An app with a features array round-trips intact; malformed JSON is rejected; publish flips status.
- Automated verify: `npx vitest run src/__tests__/app.service.test.ts` FAILS before 6-impl.
- Real path verify: n/a (unit).
- Manual/device verify: none.

**Steps:**
1. `beforeEach(resetNewTables)`.
2. Tests: `createApp` with `features:[{icon,title,blurb}]` stores JSON; `getApp` parses back equal; passing an invalid JSON string for `features` throws; `publishApp` sets status+publishedAt; `listApps` orders by sortOrder.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/app.service.test.ts`
Expected: FAIL.
<!-- /section -->

<!-- section: task-6-impl keywords: app-service, json-blocks, crud, publish -->
### Task 6-impl: app service (impl)

**Depends on:** Task 6-tests

**Files:**
- Create: `packages/api/src/services/app.service.ts`

**Expected outcome:** App CRUD + publish; `toJsonString` validates/normalizes JSON blocks.

**Regression shield:** Do not modify Task 6-tests files.

**Task Contract:**
- Expected behavior: same as Task 6-tests.
- Automated verify: `npx vitest run src/__tests__/app.service.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: Task 8 routes.
- Manual/device verify: none.

**Steps:**
1. `toJsonString(v)`: undefined→null; string→`JSON.parse` validate then return; object→`JSON.stringify`; throw on invalid.
2. `listApps({status})` order `asc(sortOrder)`, `getApp(idOrSlug)`, `createApp` (slug default slugify(name), `rating` number|null, blocks via `toJsonString`, status `'draft'`), `updateApp`, `deleteApp`, `publishApp`.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/app.service.test.ts && npx tsc --noEmit`
Expected: green.
<!-- /section -->

<!-- section: task-7-tests keywords: feed, rss, itunes, escape, vitest -->
### Task 7-tests: RSS feed builder (tests)

**Maps to Impact Map:** Data path, Attack surface (XML injection)

**Files:**
- Create: `packages/api/src/__tests__/feed.service.test.ts`

**Expected outcome:** Failing tests pin valid-feed structure, published-only filtering, and XML escaping.

**Task Contract:**
- Expected behavior: A subscriber sees one item per published episode with playable enclosure; a title containing `&`/`<` does not break the feed.
- Automated verify: `npx vitest run src/__tests__/feed.service.test.ts` FAILS before 7-impl.
- Real path verify: n/a (unit) + Task 8 endpoint.
- Manual/device verify: none.

**Steps:**
1. Build a show + 2 episodes (1 draft, 1 published, latter with `&` in title).
2. Tests: output contains `<itunes:owner>`, `<itunes:email>`, exactly one `<item>` (published only); item has `<enclosure url= type= length=>` and `<itunes:duration>`; `&` rendered as `&amp;`, no raw `<` from titles; output starts with `<?xml`.
3. CDATA safety test: an episode whose `showNotes` contains the literal `]]>` (e.g. "code: `a]]>b`") must NOT produce a bare `]]>` that terminates the CDATA early — assert the output contains `]]]]><![CDATA[>` and that the description CDATA is balanced (one `<![CDATA[` open per close around the notes).

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/feed.service.test.ts`
Expected: FAIL.
<!-- /section -->

<!-- section: task-7-impl keywords: feed-service, rss, itunes, xml-escape -->
### Task 7-impl: RSS feed builder (impl)

**Depends on:** Task 7-tests

**Files:**
- Create: `packages/api/src/services/feed.service.ts`

**Expected outcome:** `buildPodcastFeedXml(show, episodes, siteUrl)` returns valid RSS 2.0 + iTunes XML; published-only; fully escaped.

**Regression shield:** Do not modify Task 7-tests files. Pure function.

**Task Contract:**
- Expected behavior: same as Task 7-tests.
- Automated verify: `npx vitest run src/__tests__/feed.service.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: Task 8 feed curl.
- Manual/device verify: subscribe in a client (⚠️ needs reachable published audio URL — user step).

**Steps:**
1. `xmlEscape(s)` escaping `& < > " '` (`&` first) for element text + attribute values. Add `cdataWrap(s)` that neutralizes premature CDATA termination: `\`<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>\``.
2. Channel with `title/description/language/link/itunes:author/itunes:owner(name+email)/itunes:image/itunes:category/itunes:explicit/copyright`.
3. Per published episode (sorted `publishedAt` desc): `<item>` with title (xmlEscape), `guid isPermaLink="false"`, `pubDate` (`new Date(publishedAt*1000).toUTCString()`), `description` via `cdataWrap(showNotes)`, `enclosure url type length` (url xmlEscape'd in attribute), `itunes:duration`, optional `itunes:episode/season/image`.
4. Absolutize relative urls with `siteUrl` (settings `site.url` / env `SITE_URL` / default `https://norvyn.com`).

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/feed.service.test.ts && npx tsc --noEmit`
Expected: green.
<!-- /section -->

<!-- section: task-8-tests keywords: routes, hono, podcasts, apps, posts-publish, vitest -->
### Task 8-tests: routes + publish-rebuild (tests)

**Maps to Impact Map:** User path, Shared surfaces (app.ts, routes/posts.ts), Regression checks

**Files:**
- Create: `packages/api/src/__tests__/routes.podcast-apps.test.ts`

**Expected outcome:** Failing in-process route tests (via Hono `app.request()`) pin the endpoints, upsert idempotency over HTTP, feed content-type, and that publish calls the build trigger (mocked).

**Task Contract:**
- Expected behavior: Adam/admin can POST a show, upsert episodes, publish, fetch the feed; publishing triggers a rebuild; apps CRUD works; existing `/api/posts` still works.
- Automated verify: `npx vitest run src/__tests__/routes.podcast-apps.test.ts` FAILS before 8-impl.
- Real path verify: live curl sequence in 8-impl.
- Manual/device verify: none.

**Steps:**
1. `vi.mock('../services/build.service.js')` with a spy `triggerBuild`.
2. Import `app` from `../app.js`; auth is **`Authorization: Bearer <token>`** (`middleware/auth.ts:10` — NOT `x-api-key`). Seed a key: pick `rawKey` (≥8 chars), insert an `api_keys` row with `keyPrefix = rawKey.slice(0,8)`, `keyHash = await bcrypt.hash(rawKey, 10)`, `permissions = '["*"]'`, `id = nanoid()`, `createdAt = now`. Send `app.request(path, { method, headers: { Authorization: \`Bearer ${rawKey}\`, 'content-type': 'application/json' }, body })`. (`bcryptjs` is already a dep.)
3. Tests: POST `/api/podcasts` → 201 + slug; POST `/api/podcasts/:slug/episodes` twice with same `externalId` → GET episodes total == 1; GET `/api/podcasts/:slug/feed.xml` → header `application/rss+xml`; POST `/api/apps` with features array → GET `/api/apps/:slug` equal; POST `/api/posts/:id/publish` and `/api/podcasts/:slug/.../publish` → `triggerBuild` spy called; GET `/api/posts` still 200.

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/routes.podcast-apps.test.ts`
Expected: FAIL.
<!-- /section -->

<!-- section: task-8-impl keywords: routes, app-ts, podcasts, apps, posts-publish, build-trigger -->
### Task 8-impl: routes + mount + publish-rebuild (impl)

**Depends on:** Task 8-tests, Task 4-impl, Task 5-impl, Task 6-impl, Task 7-impl

**Files:**
- Create: `packages/api/src/routes/podcasts.ts`
- Create: `packages/api/src/routes/apps.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/routes/posts.ts` (publish → build trigger)

**Expected outcome:** Public read + auth write/publish endpoints for shows/episodes/feed/apps; publish on posts + podcasts + apps fire-and-forget `triggerBuild()`.

**Regression shield:** Do not modify Task 8-tests files. Existing `app.route` lines and post CRUD unchanged except the added build trigger on publish.

**Task Contract:**
- Expected behavior: same as Task 8-tests; verified live.
- Automated verify: `npx vitest run src/__tests__/routes.podcast-apps.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: live curl sequence below against dev server.
- Manual/device verify: none.

**Steps:**
1. `routes/podcasts.ts` (`podcastsRouter`): public `GET /`, `GET /:slug`, `GET /:slug/episodes`, `GET /:slug/feed.xml` (→ `application/rss+xml; charset=utf-8`), `GET /episodes/:idOrSlug`; auth `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/publish`, `POST /:slug/episodes` (create or upsert when external fields present), `PUT /episodes/:id`, `DELETE /episodes/:id`, `POST /episodes/:id/publish`, `POST /:slug/episodes/audio`.
2. `routes/apps.ts` (`appsRouter`): public `GET /`, `GET /:slug`; auth `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/publish`.
3. Publish handlers (podcasts, episodes, apps): after success, `import { triggerBuild } from '../services/build.service.js'` and call `triggerBuild()` (no await).
4. `routes/posts.ts`: in the `/:id/publish` handler, after `publishPost`, call `triggerBuild()` (no await) — DP-002 consistency.
5. `app.ts`: add imports + `app.route('/api/podcasts', podcastsRouter);` + `app.route('/api/apps', appsRouter);` before the redirect middleware.
6. Standard `{ error: { code, message } }` 404s.

**Verify:**
Run (dev server up, `KEY` set):
```
curl -s -XPOST localhost:4100/api/podcasts -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"title":"每日综合播客","ownerEmail":"norvyn@norvyn.com"}' | tee /tmp/p.json
SLUG=$(python3 -c "import json;print(json.load(open('/tmp/p.json'))['slug'])")
curl -s -XPOST localhost:4100/api/podcasts/$SLUG/episodes -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"title":"E1","audioUrl":"/uploads/x.mp3","audioSize":1234,"duration":600,"externalSource":"adam","externalId":"exec-1"}' >/dev/null
curl -s -XPOST localhost:4100/api/podcasts/$SLUG/episodes -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"title":"E1 v2","audioUrl":"/uploads/x.mp3","externalSource":"adam","externalId":"exec-1"}' >/dev/null
curl -s "localhost:4100/api/podcasts/$SLUG/episodes" | python3 -c "import sys,json;d=json.load(sys.stdin);print('episodes:',d.get('total',len(d.get('data',[]))))"
curl -s -i "localhost:4100/api/podcasts/$SLUG/feed.xml" | grep -i "content-type: application/rss"
```
Expected: episodes == 1 (idempotent); feed returns `application/rss+xml`.
<!-- /section -->

<!-- section: task-9-tests keywords: mcp, tools, registration, vitest -->
### Task 9-tests: MCP podcast/app tools (tests)

**Maps to Impact Map:** Shared surfaces (mcp/tools.ts), Existing consumers

**Files:**
- Create: `packages/api/src/__tests__/mcp.tools.test.ts`

**Expected outcome:** Failing test pins that `registerTools` registers the new `podcast_*`/`app_*` tools AND keeps all existing `blog_*` tools.

**Task Contract:**
- Expected behavior: An MCP client lists the new podcast/app tools alongside the existing blog tools.
- Automated verify: `npx vitest run src/__tests__/mcp.tools.test.ts` FAILS before 9-impl.
- Real path verify: n/a (unit) — registration assertion.
- Manual/device verify: none.

**Steps:**
1. Build a fake `server` with a `tool(name,desc,schema,handler)` that records names into an array.
2. Call `registerTools(fakeServer)`; assert the array includes the new names (`podcast_create_episode`, `podcast_create_show`, `app_create`, …) AND still includes existing ones (`blog_create_post`, `blog_upload_media`).

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/mcp.tools.test.ts`
Expected: FAIL.
<!-- /section -->

<!-- section: task-9-impl keywords: mcp-tools, podcast, app, registerTools -->
### Task 9-impl: MCP podcast/app tools (impl)

**Depends on:** Task 9-tests, Task 4-impl, Task 5-impl, Task 6-impl

**Files:**
- Modify: `packages/api/src/mcp/tools.ts`

**Expected outcome:** `podcast_*` and `app_*` tools registered with natural-phrasing descriptions; existing tools untouched.

**Regression shield:** Do not modify Task 9-tests files. No rename/removal of `blog_*` tools.

**Task Contract:**
- Expected behavior: same as Task 9-tests.
- Automated verify: `npx vitest run src/__tests__/mcp.tools.test.ts` PASSES; `tsc --noEmit` 0.
- Real path verify: boot `pnpm mcp`, tools list shows new entries.
- Manual/device verify: none.

**Steps:**
1. Import new services.
2. Add: `podcast_list_shows`, `podcast_create_show`, `podcast_publish_show`, `podcast_list_episodes`, `podcast_create_episode` (external fields → upsert), `podcast_upload_audio` (base64), `podcast_publish_episode`, `app_list`, `app_create`, `app_publish` — existing `server.tool(name,desc,schema,handler)` shape, comma-separated arrays, `JSON.stringify` returns.
3. Descriptions in natural user phrasing (e.g. `podcast_create_episode`: "Create or update a podcast episode (idempotent when an external id is given — safe for automated re-delivery)").

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/mcp.tools.test.ts && npx tsc --noEmit && grep -c "server.tool(" src/mcp/tools.ts`
Expected: green; count up by ~10.
<!-- /section -->

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-05-30
- **Verifier:** dev-workflow:plan-verifier (Opus). 3 must-revise items fixed (Bearer auth seeding/curl; raw-SQL DDL NOT NULL/DEFAULT parity + service-set defaults; RSS `]]>` CDATA neutralization + test) and 1 parity advisory (podcasts `slug`/`title` DDL) closed. Report: `.claude/reviews/plan-verifier-2026-05-30-145333.md`.
