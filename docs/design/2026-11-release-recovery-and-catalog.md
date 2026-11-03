# Release recovery and approved catalog completion

Date: 2026-11-03. All changes and rehearsals are local. No remote-host mutation,
deployment, commit, push, credential change or production catalog write occurred.

## Three release blockers corrected

1. **Runtime entries:** release guards permit only the observed `.cache/`,
   `.local/`, `blog.db.bak-pageviews-20260604-125139` and `build-status.json`
   entries under `packages/api/data`, plus the two new lock files. Other
   untracked files and any tracked edits still stop release. Snapshot records
   file hashes and archives these runtime entries privately without deleting
   them. Cache symlinks are preserved as links, without following their targets.
2. **Rollback compatibility:** root package `version` fields may differ. The
   actual production revision `afc11179edae3395b69978e63a505621767764b3` and local
   base `d5779441b54ea567c450c090d22ec2035be34b7b` exercise that exact case. Every
   other manifest field, lockfile, workspace configuration, npm configuration
   and Node-version file remains protected. Rollback restores frontend source
   and output only, retaining the reviewed-import API, current database,
   uploads, environment and compatible runtime.
3. **Failure/concurrency safety:** setup, snapshot and rollback use a deployment
   mutex and share the content-build lock. They pause the watcher and wait for
   an existing legacy build to finish rather than killing it. Setup and content
   rebuilds build into staging directories; only complete artifacts replace
   live output. Failed builds retain served output. A failed promotion restores
   the prior directory. Cleanup kills/waits for the temporary API, recovers the
   managed service if stopped, releases locks and restores the prior watcher.
   Rebuild requests are consumed only after acquiring the lock; a request
   arriving during a build remains queued. Snapshot pauses only the rebuild
   watcher and leaves API/Caddy up. Hashing streams large archives in chunks.

`WORDBASE_RELEASE_ROOT` lets privately staged helpers target the checkout
explicitly before those helpers exist in production Git. The standard setup
invocation remains `ssh norvyn 'bash -s' < deploy/setup.sh` after authorization.
Promotion uses two renames, and Caddy still restarts; zero downtime is not claimed.

## Recovery evidence

`python3 scripts/test-release-recovery.py` passes **14 tests**. Each disposable
checkout starts from the exact production Git object, with SQLite DDL extracted
from that revision and the four observed runtime paths. Database contents,
uploads, environment and service state are synthetic. No new commits are
created. Git pull, systemd, ownership and SELinux commands are local doubles;
file copies, SQLite backups, archive extraction, hashes and kernel file locks
are real. This is not a claim of an actual production/Linux service rehearsal.

Covered: private snapshot/integrity/runtime preservation; cache-link preservation;
unaccounted/tracked-edit refusal; failed frontend build; failed temporary-API
readiness; failed swap; successful promotion; version-only rollback retaining
post-snapshot data/uploads/API; dependency-change refusal; corrupted archive
refusal before service changes; failed content build retaining output/new
request; deployment contention; rebuild waiting without consuming its marker;
and Node 18 refusal before checkout/service mutation. Evidence is in ignored
`.preview/release-rehearsal/tests.log`. The seven pre-existing
`docs/content-updates/` files retain their recorded hashes.

## Additional concrete runtime gate

Read-only production inspection found **Node 18.20.8**. The actual locked
`better-sqlite3` **12.8.0** package declares `20.x || 22.x || 23.x || 24.x || 25.x`.
Setup now refuses unsupported runtimes before changing checkout, locks or
services. Recovery simulations use the tested compatible Node 25 version by
default and separately exercise the exact observed Node 18 refusal. An
authorized compatible-runtime change and real host preflight remain necessary;
no remote runtime was installed or changed here.

## Approved Web app and repository catalog

The approved live design was read directly at its `#apps` view. Its 11 apps,
Web platform, Nearly destination and 19 default project entries are requirements,
not optional additions. Source records are in `content/reviewed-apps.json` and
the complete designed ordering is in `content/reviewed-app-order.json`.

- **Nearly:** real `platform: Web` row, real `/apps/nearly` and `/en/apps/nearly`
  detail routes, browser-oriented copy, explicit invite/login access and
  `https://nearly.run/` CTA. Its public homepage was inspected without logging
  in or supplying photos. The screenshot under
  `packages/web/public/images/apps/nearly-public.jpg` is an actual public-page
  capture, not generated product media. No Apple identity, store URL, price or
  promotional video was invented. JSON-LD identifies it as `WebApplication`.
- **EXT4 Access:** the other missing designed catalog record is present, with
  both-language detail routes and the established `extfs-support` /
  `extfs-privacy` destinations. The excluded external-project video was not
  copied or used. Its absence remains an honest media limitation.
- `scripts/prepare-reviewed-catalog.mts` always forces an in-memory SQLite DB.
  It exercises actual `createApp`, `publishApp`, `getApp` and `listApps` services
  and checks platform/publication roundtrips with no store identity. Output
  feeds an explicit `--catalog-review` mode of the offline preview server.
  Original captured public responses are unchanged. Existing text platform
  columns already support Web; no unnecessary schema migration was added.
  An API test also verifies Web persistence/publication without Apple data.
  Final verification caught and fixed `createApp` dropping its optional subtitle;
  the SQLite insert and MCP create schema/handler now preserve it. Nearly's
  invite-access label is present on both the catalog card and detail page.
- English editorial copy is independent of imported App Store fields. Web and
  macOS media prefer landscape shots where dimensions are known; website URLs
  are validated independently of store links. Both catalog and detail views
  expose the real website destination.
- The public GitHub API verified **31** public repositories: **19** non-archived,
  non-fork records, **9** archived and **3** forks. All are stored as a build-time
  snapshot in `packages/web/src/data/public-repositories.json`; no visitor-time
  GitHub calls occur. The default 19 match the design, with All/Archived/Fork and
  category filters. Archive/fork status is visible; no maintenance or license
  claim is inferred from public visibility. Seven previously missing default
  entries are restored. No private repositories or other local projects were read.

The two app rows and reviewed ordering still need their authorized production
authoring step during release. Deploying source alone must not be mistaken for
publishing those database records. Inclusion is settled; production writes remain
deferred by the owner's explicit restriction. Promotional media remains pending
actual Wordbase assets, with existing screenshots/fallbacks retained.

## Final verification and review

- API: **1,009 tests**, 62 files; TypeScript build passed.
- Web: **320 tests**, 19 files; Astro check **0 errors, 0 warnings**, 6 hints.
- Static build: **876 pages**. URL check: **833 routes**, preserving all **829**
  baseline URLs and allowing exactly the four new app routes; **60** protected
  pages and **two feeds** unchanged, zero failures. Baseline was not recaptured.
- **24** catalog browser checks: eight index/filter checks and 16 Nearly/EXT4
  detail checks, covering 1280/320px, both languages and themes; no overflow.
  Web returns Nearly only. Project filters return 19/31/9/3. Real screenshot
  loading/proportions, expansion, Escape and Web structured data were checked.
- Evidence: ignored `.preview/catalog-review/` and
  `.preview/release-rehearsal/`. Shell/Python syntax and `git diff --check` pass.

Review the complete catalog at `http://127.0.0.1:4413/apps`; Nearly at
`http://127.0.0.1:4413/apps/nearly` (English twins available). Production release
remains pending compatible-runtime work and owner authorization. ASC URLs,
credentials, domains, protected legal text and production content are untouched.
