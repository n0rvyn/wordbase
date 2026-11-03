# Public redesign: review and release

Status: implementation and private preview only. Production release is not authorized. Current recovery/catalog evidence: [release recovery and catalog](2026-11-release-recovery-and-catalog.md).

## Agreed scope

- Apply the reviewed norvyn design study to public Wordbase pages using existing domains and routes.
- Keep admin and subdomains deferred. Preserve English routes, canonical/hreflang, feeds, episode GUIDs, upload/download URLs and companion page content.
- Curate app publication, copy and artwork. Apple imports are proposals requiring explicit review; discovery remains draft-only.
- Remove development-only captions, implementation explanations and prototype notes from public visitor surfaces. Preserve media behavior.
- No ASC metadata, DNS, credentials or production content changes during preview.

## Private preview and verification

Use a working Node runtime on PATH (the default Homebrew Node on the investigation host was broken). Keep all preview files inside ignored `.preview/`. Do not copy `.env` or credentials into this checkout.

1. `python3 scripts/check-preview.py --capture` captures sitemap, 60 protected companion-page bodies/links, and blog/podcast RSS identities through public GET requests.
2. `python3 scripts/preview-readonly.py` binds only to `127.0.0.1:4410`. It snapshots public GET responses, serves the built frontend, and rejects all writes. It never forwards authentication headers.
3. Build with `API_URL=http://127.0.0.1:4410 PUBLIC_SITE_URL=http://127.0.0.1:4410 pnpm --filter web build`. These are preview-only overrides; production must use its normal environment.
4. Run API/web tests and API TypeScript build. Run `python3 scripts/check-preview.py --preview http://127.0.0.1:4410` to compare all baseline URLs, protected prose/links and feed identities, confirm real 404s and rejected preview writes.
5. Inspect representative home, writing/article, apps/details, podcast/episode, about/search/taxonomy/companion/404 pages in Chinese and English. Check desktop and 390px/320px, light/dark/system, storage failures, OS theme changes, keyboard navigation, reduced motion, long text, media aspect ratios, search and player controls.
6. Freeze and replay the content cache with `--offline` when reproducing a reviewed build. Cached public GETs are a QA snapshot, not a production backup.

The review build points browser requests at the local read-only server. Comment submission, analytics writes and catalog writes are intentionally rejected by the preview. Player download URLs resolve to the actual media URL from cached episode metadata instead of calling production's stateful download tracker. Feed responses are captured once by the explicit baseline audit and cached; preview browsing never polls the live feed. The explicit initial feed audit may register one normal feed poll. Validate writes using isolated API tests, never by posting to production.

## Protected URL rules

ASC support/privacy links retain their exact root URLs: `https://norvyn.com/<slug>`, without `/en/` for every locale. Existing English URLs remain available. Existing marketing URLs, including `/mdview`, `/claudex`, `/doodlehop` and Lucent's English app URL, remain available too.

Do not infer link inventory from catalog apps. EXT4 Access and MDView have companion pages independently of catalog membership. Several apps still register Notion URLs in ASC; migrating those registrations is separate work. Do not change any ASC fields as part of this release.

## Release gate

Before production authorization, present the private preview, full test/build results, route/content/feed comparison, visitor-copy audit and known limitations. Retain original uncommitted content-update files untouched. No automatic release follows a successful build.

After explicit release authorization:

1. Read current production revision, working-tree status, dependency lockfile, DB path and service/build status. Require a compatible Node runtime: the frozen better-sqlite3 12.8.0 engine range is Node 20 or 22–25; observed production Node 18.20.8 is outside it, and setup now aborts before mutation. Do not upgrade the remote runtime without authorization. Abort on unaccounted tracked/untracked changes; the four observed runtime entries are explicitly permitted, inventoried and archived, never deleted. Confirm actual DB location; `snapshot-release.sh` defaults to the repository's documented production path and must be adjusted if production overrides it.
2. Stage the reviewed snapshot/restore scripts and `release_guard.py` together in a private tools directory outside the checkout (they are not on the old production revision). Run `WORDBASE_RELEASE_ROOT=/var/www/wordbase bash /private/tools/snapshot-release.sh /private/backup/new-release` with a new private backup directory outside the checkout. The helper pauses the rebuild watcher, waits for an existing build, shares deployment/build locks, and restores the watcher on exit; API and Caddy stay up. Verify source, consistent SQLite snapshot, API build, static/uploads archive and runtime inventory/archive hashes. Preserve existing environment and dependency installation. Store no backup in the public web root.
3. Deploy only the reviewed source via the repository-prescribed `ssh norvyn 'bash -s' < deploy/setup.sh`. Do not improvise a separate pull/build/restart sequence.
4. Apply the already-approved catalog additions from `content/reviewed-apps.json` and ordering from `content/reviewed-app-order.json` through the existing app authoring services/MCP after release authorization, preserving any existing rows and refusing slug collisions. Do not silently omit Web apps or fabricate media. The memory-only preview preparation script cannot apply production changes. Recheck exact protected URLs and prose, main routes in both languages, RSS/GUID/enclosures, media, API/MCP scopes and import review behavior. Record the deployed revision and site rebuild status.

## Rollback preparation

Deployment and content rebuilds now build outside live `dist` and promote only complete artifacts. Separate deployment/build locks coordinate setup, snapshots, rollback and marker-triggered builds. Setup pauses the watcher and waits for legacy builds without killing them. EXIT/INT/TERM cleanup terminates its temporary API, restores the managed API if it stopped it, releases locks and resumes the prior watcher state. A frontend-build failure keeps prior static output; a failed directory swap restores it. Promotion still uses two renames and Caddy is restarted, so this is not a zero-downtime guarantee. Schedule an attended window and snapshot before deployment.

Rehearse archive extraction into a disposable directory and verify `blog.db` integrity before authorizing release. Keep the previous revision, `source.tar`, `api-build.tgz`, `static-and-uploads.tgz`, `blog.db` and `sha256.json` together. Preserve the existing dependency installation because this release should not change dependency manifests.

Rollback is a separate authorized production action: `bash deploy/restore-release.sh /absolute/private/snapshot-directory`. The default restores the prior frontend source and static output while retaining the new reviewed-import API. It verifies hashes and dependency/build inputs (allowing only package-root version-field differences), stages prior static artifacts before pausing the rebuild watcher, restores frontend files/output, reapplies ownership/SELinux labels and resumes the watcher. Current API, uploads, database and environment remain intact. The API is never downgraded automatically: the previous API would re-enable automatic sync and overwrite curated content. The compatible runtime is also retained. A full API downgrade needs its own review and isolation of old sync/cron/webhook entry points. The additive import-review table can remain without dropping it.

Frontend rollback deliberately leaves tracked `packages/web` changes against the release HEAD, and retains failed output in a private `.rollback-stage.*` directory. Preserve and inspect that known diff before a later release. A DB restore requires a separate check for post-snapshot writes and explicit authorization.

No production snapshot or rollback was performed during private-preview work.
