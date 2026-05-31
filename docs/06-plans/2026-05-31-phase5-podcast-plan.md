---
type: plan
phase: 5
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
design_ref: none (Podcast.html absent — built fresh from Home v2 .feat-ep/.ep patterns)
created: 2026-05-31
status: draft
---

# Phase 5 Plan — Podcast archive (/podcast)

**Goal:** A single-show podcast archive page built fresh from Home v2's `.feat-ep`/`.ep` patterns: hero + featured (latest) episode with native `<audio>` + full episode list + subscribe/RSS link, empty-safe. Currently 0 published podcasts → page shows a quiet empty state; seed one → it renders.

**Goal (project health):** active_churn yellow (12 dirty files — uncommitted P3.5/P4 work, expected), doc_drift yellow (no project context file), module_size yellow (generated `dist/db/schema.d.ts`). None block; purely additive page, no edits to churning files.

**Scope:** `/podcast` page: hero/spine; featured episode (native `<audio>`); episode list (number·title·date·duration, each with native audio); subscribe/RSS → `/api/podcasts/:slug/feed.xml`. Empty-safe two-tier (no podcast / podcast-but-no-episodes). Consistent with Home's podcast markup; no faux JS player (mirror Home [D-D]).

## Grounding facts (verified this session)

- **No Podcast reference HTML** (`find docs/design -iname "*podcast*"` = 0). Source patterns: Home v2's podcast block, already ported into `src/pages/index.astro:185-233` (`.feat-ep`/`.ep-cover`/`.ep`) and its scoped styles (`index.astro:359-411`). The reference's faux JS `.player`/`.play-btn`/`.track`/`.bar` (Home v2.html:149-157) was **dropped in Phase 2 for native `<audio controls>` per [D-D]** — Phase 5 follows the same decision.
- **`api.ts` already has** `getPodcasts({status})`, `getEpisodes(slug,{status})`, `Podcast` (line 255: slug/title/description/coverImage/author/ownerName/link/...), `Episode` (line 276: slug/title/audioUrl/audioType/duration/coverImage/episodeNumber/createdAt/... — **no `publishedAt` field**; date = `createdAt`). No api.ts change needed.
- **`home.ts` already exports** `selectFeaturedEpisode` (highest episodeNumber → latest createdAt), `formatDuration` (sec → 'X min' / '<1 min' / ''), `formatMonoDate` (ts → 'YYYY · MM · DD'), `decodeEntities`. **Reuse — do NOT reimplement** (重构前必 grep / shared-component rule). `formatDuration` is already covered by `home.test.ts` — Phase 5 tests do not duplicate it.
- **Global vs scoped CSS** (`BaseLayout.astro:155-200` `is:global`): `.wrap/.row2/.spine/.list/.item/.item-title/.item-sub/.item-meta` + nav + footer are GLOBAL. `.sec/.btn/.eyebrow/.lede/.feat-ep/.ep-cover/.ep/audio/.viewall` are NOT global (page-scoped in index.astro/writing) → the podcast page adds them in its own Astro `<style>` (scoped), mirroring how `writing/index.astro` re-declares `.sec`/`.item` variants scoped. Per-page scoped duplication is the established pattern here — NOT a base-layer violation, so do not refactor Home's blocks into global.
- **Prod API topology (verified `deploy/wordbase:9-15`):** Caddy on norvyn.com proxies `/api/*` → `localhost:4100` and `/uploads/*` → api data dir, **same-origin**. So the RSS/subscribe href must be a **relative** `/api/podcasts/${slug}/feed.xml` (resolves same-origin in prod). Using `getApiUrl()`/`API_URL` would bake `http://localhost:4100` into the static HTML (API_URL is unset at build → falls back to localhost) and 404 in prod. Same reasoning: `ep.audioUrl` is rendered as-is (`/uploads/...` relative or absolute both resolve same-origin); no URL transform.
- **`feed.xml` route exists** (`packages/api/src/routes/podcasts.ts:47`). Episodes route: `GET /api/podcasts/:slug/episodes` (line 35).
- **Host is "Adam"** (dev-guide Phase 5 用户可见的变化), not norvyn — use `Podcast.author ?? Podcast.ownerName` from data, never a hardcoded name (rule: names from product copy/data, not identifiers).
- **Current DB:** 0 published podcasts/episodes (Global Constraint: tables empty). So the default build exercises the empty path; seeded build is an explicit verification task.

## Decisions (all Chosen — autonomous run per user "go ahead"; defaults follow empty-safe global constraint + Home [D-D] precedent; surfaced here per 必须在计划中明确)

- **[DP-5.1] Single show, deterministic selection.** Product is one show (《边角》); data model allows many. Render exactly one show via `selectShow(podcasts)` = sort by `sortOrder` asc (nulls last), tiebreak `createdAt` asc, take first. (Home uses `podcasts[0]` relying on API order; this plan makes it order-independent/stable.) Recommended over listing multiple shows — matches product.
- **[DP-5.2] Episode list-row playback = native `<audio controls preload="none">` per row.** Honest, no faux JS player — consistent with [D-D]. Recommended over a vanilla-JS one-player-swap-src approach (more faithful to the reference's quiet `.mini` circle, but reintroduces a faux player [D-D] rejected). The featured episode uses `preload="metadata"` (mirror Home `index.astro:209`).
- **[DP-5.3] Featured episode = `selectFeaturedEpisode(episodes)`** (reused). Archive list = remaining episodes (`sortEpisodes` then exclude featured.id) — mirrors writing's featured+archive split.
- **[DP-5.4] Subscribe/RSS href = relative `/api/podcasts/${podcast.slug}/feed.xml`** (same-origin, verified topology). Shown only when a podcast exists (needs slug). If `podcast.link` is set, add a secondary external link button ("在播客客户端收听").
- **[DP-5.5] Empty-safe two-tier:**
  - **No published podcast at all** → hero with generic `h1 "播客"` + quiet empty state (friendly "播客即将上线，敬请期待。" — NO fake 《边角》, NO subscribe link).
  - **Podcast published but 0 published episodes** → hero with real show title/description + subscribe/RSS link + quiet "暂无单集" under section 01.
- **[DP-5.6] Host/credit line** uses `podcast.author ?? podcast.ownerName` when present; omitted entirely if both null. Never hardcode "Adam"/"norvyn".
- **[DP-5.7] Archive sort** = `episodeNumber` desc (nulls last), tiebreak `createdAt` desc (newest first).

## Impact Map

| Change | File | Consumers |
|---|---|---|
| New pure helpers: `selectShow`, `sortEpisodes`, `episodeMeta` (imports `formatDuration`/`formatMonoDate` from home.ts) | `packages/web/src/lib/podcast.ts` (new) | `podcast.astro`; `podcast.test.ts` |
| Unit tests for the 3 new helpers (not `formatDuration` — already in home.test.ts) | `packages/web/src/lib/podcast.test.ts` (new) | vitest |
| New page + scoped styles | `packages/web/src/pages/podcast.astro` (new) | resolves Home's existing `/podcast` viewall + nav `Podcast` link |
| Build/seed verification | (no file) | dist assertions |

> Purely additive — no edits to existing files. BaseLayout nav already links `Podcast → /podcast` (Phase 1) and Home's podcast section links `/podcast` (viewall + `.ep` rows) — currently dangling, start resolving.

---

## Task 1 — `src/lib/podcast.ts` (pure helpers) + tests

**Files:** `packages/web/src/lib/podcast.ts` (new), `packages/web/src/lib/podcast.test.ts` (new)

**Steps:**
1. Import `type { Podcast, Episode }` from `./api`; import `{ formatDuration, formatMonoDate }` from `./home` (reuse — do not reimplement).
2. `selectShow(podcasts: Podcast[]): Podcast | null` (DP-5.1) — empty → `null`; else `[...podcasts].sort` by `sortOrder ?? Infinity` asc, tiebreak `createdAt` asc, return `[0]`. Pure; deterministic regardless of input order.
3. `sortEpisodes(eps: Episode[]): Episode[]` (DP-5.7) — return a NEW sorted array: `episodeNumber` desc with nulls last (`a.episodeNumber ?? -Infinity` so nulls sink), tiebreak `createdAt` desc. Do not mutate input.
4. `episodeMeta(ep: Episode): string` (mapping) — build parts and join with `' · '`: `EP.${episodeNumber}` (only if `episodeNumber != null`), `formatMonoDate(ep.createdAt)`, `formatDuration(ep.duration)` (only if non-empty). Returns e.g. `EP.3 · 2026 · 05 · 21 · 48 min`.

**Verification (`pnpm vitest run podcast`):**
- `selectShow([])===null`; `selectShow([{sortOrder:2,createdAt:10},{sortOrder:1,createdAt:5}])` → the `sortOrder:1` one; nulls-last (`{sortOrder:null}` loses to `{sortOrder:5}`); createdAt tiebreak when sortOrder equal; same result for reversed input order (determinism).
- `sortEpisodes`: `[EP1,EP3,EP2]` → `[EP3,EP2,EP1]`; null episodeNumber sinks below numbered; createdAt-desc tiebreak among equal/both-null; original array unmutated.
- `episodeMeta`: **pin the EXACT assembled string** for a fixed `createdAt` (compute expected `YYYY · MM · DD` from the chosen UTC ts), e.g. `episodeMeta({episodeNumber:3,duration:2880,createdAt:<fixed ts>})` `=== 'EP.3 · <computed date> · 48 min'` (full equality, catches separator/format regressions — not just substring presence); `episodeNumber:null` → result has no `EP.` prefix; `duration:0` → no duration segment (formatDuration→''); `duration:null` likewise.

## Task 2 — `src/pages/podcast.astro` (page + scoped styles, empty-safe)

**Files:** `packages/web/src/pages/podcast.astro` (new)

**Steps:**
1. **Frontmatter:** import `BaseLayout`; `getPodcasts`, `getEpisodes`, `stripMarkdown`, `type Episode` from `../lib/api`; `selectFeaturedEpisode`, `formatDuration`, `formatMonoDate`, `decodeEntities` from `../lib/home`; `selectShow`, `sortEpisodes`, `episodeMeta` from `../lib/podcast`.
   - `const { data: podcasts } = await getPodcasts({ status: 'published' });`
   - `const podcast = selectShow(podcasts);` (DP-5.1)
   - `let episodes: Episode[] = []; if (podcast) episodes = (await getEpisodes(podcast.slug, { status: 'published', limit: 10000 })).data;` (**limit explicit** — API default is small; mirror Phase 4 MR-3).
   - `const featuredEp = selectFeaturedEpisode(episodes);`
   - `const archive = sortEpisodes(episodes).filter(e => e.id !== featuredEp?.id);` (DP-5.3/5.7)
   - `const showTitle = podcast ? decodeEntities(podcast.title) : '播客';`
   - `const feedHref = podcast ? \`/api/podcasts/${podcast.slug}/feed.xml\` : null;` (DP-5.4, relative)
   - `const host = podcast?.author ?? podcast?.ownerName ?? null;` (DP-5.6)
2. `<BaseLayout title={podcast ? \`${showTitle} — norvyn\` : '播客 — norvyn'} description={podcast?.description ? stripMarkdown(podcast.description, 120) : '一档慢节奏的播客。'}>`.
3. **00 HERO** (spine, mirror writing hero `writing/index.astro:62-83`): `.sec.wrap` with `style="border-top:none;padding-top:clamp(44px,6vw,80px)"`; `.row2` → `.spine` (`00` / `Podcast` / note = show desc snippet or "一档慢节奏的播客。"); content col: `.eyebrow` ("Podcast" + ` · 主播 ${host}` when host present), `h1={showTitle}`, `.lede` = `podcast.description` via `stripMarkdown(...,160)` (or static lede when no podcast), and a `.subscribe` row when `feedHref`: `<a class="btn btn-1" href={feedHref}>订阅 · RSS ↗</a>` + (when `podcast.link`) `<a class="btn btn-2" href={podcast.link} target="_blank" rel="noopener noreferrer">在播客客户端收听</a>`.
4. **Empty path A — no podcast** (`!podcast`): after hero, render a quiet `.empty` block: "播客即将上线，敬请期待。" (DP-5.5). No further sections. (Hero already shows generic 播客.)
5. **01 LATEST** (`podcast && featuredEp`): `.sec.wrap` → `.row2` → `.spine` (`01` / `Latest` / "最新一期。"); `.feat-ep` (port from `index.astro:197-211`): `.ep-cover` = `<img>` of `podcast.coverImage || featuredEp.coverImage` else `<span>{showTitle.charAt(0)}</span>`; `.eb` → `.en` = `featuredEp.episodeNumber != null ? \`EP.${n} · 最新一期\` : '最新一期'`, `h3={featuredEp.title}`, `<audio controls preload="metadata" src={featuredEp.audioUrl}></audio>` (DP-5.2).
6. **Empty path B — podcast but 0 episodes** (`podcast && !featuredEp`): under a `01 / Latest` spine, render `.empty` "暂无单集。" (DP-5.5). Subscribe link already in hero.
7. **02 ALL** (`podcast && archive.length > 0`): `.sec.wrap` → `.row2` → `.spine` (`02` / `Episodes` / "全部单集，按期号倒序。"); `.list` → each archive ep as a `.item.ep-row`: a header line (`.item-title`={ep.title}, `.item-meta`={episodeMeta(ep)}) + `<audio controls preload="none" src={ep.audioUrl}></audio>` below (DP-5.2). (If `archive.length===0` but `featuredEp` exists — single-episode show — section 02 is simply absent; the featured player covers it.)
8. **Scoped `<style>`** (Astro scoped, NOT global): port from `index.astro` scoped block ONLY the podcast-relevant rules + writing hero rules: `.sec` (`index.astro:272`), `.eyebrow` (from `writing/index.astro:196-200`) — note **`.lede` is already GLOBAL** (`tokens.css:154`) so do NOT redeclare it scoped (the verifier flagged the earlier `writing:196-209` ref as `.lede-w`, the wrong class); `.btn/.btn-1/.btn-2` (`index.astro:259-269`), `.subscribe{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}`, `.feat-ep/.ep-cover/.ep-cover span/.feat-ep .eb .en/.feat-ep .eb h3/audio` (`index.astro:359-383`), `.ep-row{grid-template-columns:1fr;gap:10px 0;align-items:start}` + `.ep-row audio{margin-top:4px}` (full-width player row, NOT Home's 3-col `.ep`), `.viewall` (`index.astro:398-405`), `.empty{padding:clamp(28px,5vw,56px) 4px;color:var(--ink-3);font-family:var(--font-read);font-size:16px}`, and the `@media(max-width:880px){.feat-ep{grid-template-columns:1fr}}` rule. Do NOT re-declare global `.row2/.spine/.list/.item/.item-title/.item-meta/.wrap`. Do NOT port `#tweaks`/`.player`/`.play-btn`/`.track`/`.bar`/nav/footer (faux player + chrome owned by BaseLayout / stripped).

**Verification:** `pnpm build` — see Tasks 3 & 4.

## Task 3 — Build verification (empty-safe, current DB)

**Steps:**
1. Ensure local API serves current DB (0 published podcasts). Run `pnpm build` in `packages/web`.
2. Assert built `dist/podcast/index.html` exists, build exit 0, page count = current Home count (no new dynamic pages; `/podcast` is a single static route — total should be prior 347 + 1 = 348 if not already counted; record actual).
3. Assert empty path A: dist `/podcast` contains the `.empty` "播客即将上线" text, generic `h1 播客`, and **no** `<audio` element, **no** `/api/podcasts/` feed href (no podcast → no subscribe link).
4. Assert NO `tweaks`/`EDITMODE`/faux-player (`play-btn`/`class="track"`/`class="bar"`) in dist `/podcast`; exactly one `<h1>`; nav `Podcast` link present.
5. `pnpm vitest run` full green (prior 98 + new podcast.test.ts); `astro check` 0 errors (pre-existing admin `ts(6133)` warnings only).

**Verification:** build exit 0; empty-path dist assertions pass; vitest/astro check green.

## Task 4 — Seeded-state real-path verification (then restore empty) — ORCHESTRATOR-RUN (main context)

> **Method changed from plan draft (new evidence):** API key tokens are NOT recoverable (`api_keys` stores only bcrypt hashes; `auth.ts:19`) and there is no key-creation route. So seed via **direct SQLite INSERT/DELETE** on `packages/api/data/blog.db` (the API reads the same DB at build time). Fully reversible by id. Run by the orchestrator in main context (cleanup obligation), not the mechanical executor.

**Steps:**
1. **Seed (direct SQLite)** — verified schemas: `podcasts` (NOT NULL: id, slug, title, status, created_at, updated_at) + `podcast_episodes` (NOT NULL: id, podcast_id, slug, guid, title, audio_url, audio_type, audio_size, status, created_at, updated_at; FK podcast_id→podcasts.id, ON DELETE CASCADE):
   ```sql
   INSERT INTO podcasts (id,slug,title,description,author,language,explicit,status,sort_order,created_at,updated_at)
   VALUES ('p5test','bianjiao-test','《边角》测试','一档关于做产品的慢节奏播客。','Adam','zh-CN',0,'published',0,1716000000,1716000000);
   INSERT INTO podcast_episodes (id,podcast_id,slug,guid,title,audio_url,audio_type,audio_size,duration,episode_number,episode_type,status,published_at,created_at,updated_at) VALUES
   ('e5t1','p5test','ep-1-test','guid-e5t1','第一期 · 开始','https://example.com/audio/ep1.mp3','audio/mpeg',0,2880,1,'full','published',1716000000,1716000000,1716000000),
   ('e5t2','p5test','ep-2-test','guid-e5t2','第二期 · 继续','https://example.com/audio/ep2.mp3','audio/mpeg',0,3600,2,'full','published',1716100000,1716100000,1716100000);
   ```
   Then confirm the API serves them: `curl -s "localhost:4100/api/podcasts?status=published"` (total 1) + `curl -s "localhost:4100/api/podcasts/bianjiao-test/episodes?status=published"` (2 episodes). If the API caches, restart `wordbase-api` / re-fetch. featured = EP.2 (highest episodeNumber); archive = EP.1; duration 2880=48 min, 3600=60 min.
2. `pnpm build`. Assert dist `/podcast/index.html`:
   - Hero shows the seeded show title + subscribe link `href="/api/podcasts/<slug>/feed.xml"` (relative — assert NOT `localhost:4100`).
   - **01 Latest**: `.feat-ep` with `<audio controls preload="metadata" src="<ep2 audioUrl>">` (featured = highest episodeNumber = EP.2).
   - **02 All**: archive list contains EP.1 as a `.item.ep-row` with its own `<audio ... src="<ep1 audioUrl>">` and meta string containing `EP.1` + `48 min`.
   - No `.empty` text.
3. **Cleanup — restore empty (direct SQLite):** `DELETE FROM podcast_episodes WHERE podcast_id='p5test'; DELETE FROM podcasts WHERE id='p5test';` (FK cascade also covers episodes). Confirm `curl localhost:4100/api/podcasts?status=published` total 0; `pnpm build` once more → `/podcast` back to empty path A. Leave DB in the original empty state (no `p5test` residue — mirror Phase 2's seed-then-delete).
4. ⚠️ 浏览器验证（不能自验）：实际音频播放（点 play 出声）、订阅链接在生产 same-origin 解析到 feed.xml、横滑/布局手感 — 标注留累积评审。dist 断言只证明 `<audio src>` 与 feed href 已正确渲染，不证明运行时播放。

**Verification:** seeded build dist assertions pass (featured + archive audio + relative feed href); cleanup build returns to empty; DB restored to 0/0.

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-05-31
- **Mode:** --fast (Sonnet). 5 falsifiable assertions tested 0 failed; 0 compile/runtime failures; 2 logic tasks both type-matched tests; 6 tokens 0 missing. 0 must-revise.
- **Advisories applied:** (1) `.lede` is global (tokens.css:154) — corrected the wrong `writing:196-209`/`.lede-w` port ref, no scoped redeclaration; (2) `episodeMeta` test pins exact assembled string (not substring). Spot-verified: tokens.css:154 `.lede` global ✓, BaseLayout:81-82 `<main><slot/>` ✓ (no nested main).
