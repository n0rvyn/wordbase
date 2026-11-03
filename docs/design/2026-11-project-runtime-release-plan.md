# Project-scoped Node runtime and attended release plan

Status: prepared and rehearsed locally; **no remote installation, service change,
deployment, commit, push or production authoring was performed**. All commands
below are proposed future authorized actions, not a record of execution.

## Selected solution and host evidence

Use official **Node 24.22.2 LTS**, pinned in `deploy/runtime-lock.json`, and
**pnpm 10.28.2 invoked as JavaScript through that exact Node**. Do not replace
`/usr/bin/node`, install global npm packages, change shell profiles or repoint
the host's standalone pnpm. The official release is dated October 28, 2026:
[Node release and checksums](https://nodejs.org/en/blog/release/v24.22.2).
Node's Linux x64 binaries support glibc 2.28+:
[official platform notes](https://nodejs.org/en/blog/migrations/v22-to-v24).

Read-only inspection on November 3 confirmed:

- Host `norvyn`: x86-64, glibc 2.34; Node 18.20.8, ABI 108.
- Wordbase's installed better-sqlite3 is 12.8.0, declaring Node 20/22–25.
  Node 18 happens to run the existing binary but is outside that supported range.
- `/usr/bin/pnpm` resolves to a standalone ELF executable. Merely changing PATH
  for Node does not establish which Node its native install scripts use.
- Live Wordbase revision is still `afc11179edae3395b69978e63a505621767764b3`.
  API and rebuild services currently use the shared system runtime/tooling.
- Dependencies occupy about 362MB; earlier free disk was 6.6GB. Observed
  MemAvailable was about 869MB. Recheck immediately before execution.
- Live `/etc/caddy/sites.v2/wordbase` and repository `deploy/wordbase` have the
  same SHA-256, `8ad5dc244430130a3e662a3387c225afdc7da934479c660a445013e81407a956`.

The project-private layout will be:

```
/opt/wordbase/runtime/node-v24.22.2-linux-x64/
/opt/wordbase/tooling/pnpm-10.28.2/
/opt/wordbase/bin/node                 # symlink to the pinned private binary
/opt/wordbase/bin/pnpm                 # deploy/wordbase-pnpm wrapper
/opt/wordbase/store-node24/            # project-only package store
```

Only two Wordbase service overrides are installed, from the reviewed templates:
`deploy/wordbase-api-runtime.conf` and `deploy/wordbase-rebuild-runtime.conf`.
The API gets an explicit Node executable; the rebuild service gets the private
PATH and a 512MB V8 heap cap. Existing user, working directory, environment file,
DB/uploads paths and service sandbox remain. The wrapper uses a Wordbase-only
cache inside the existing writable data directory; stage preparation overrides
that cache into its private staging directory.

Other services keep their system Node/pnpm and unit files. The runtime helper
does not operate on Caddy or other application units. Setup now skips the shared
Caddy restart when its Wordbase config is unchanged, with a regression test.
CPU, RAM and disk remain shared resources: cold builds can cause contention.
The heap cap limits V8, not total resident memory. Use serial dependency builds,
monitor the attended window, and stop if staging fails or memory/disk is unsafe.

## Isolated evidence and limits

An explicit source/configuration allowlist copied 298 files into
`.preview/node24-rehearsal/source`; credentials and runtime data were excluded.
The original copy request was rejected by automatic approval review for possible
`.env` inclusion and did not execute. The safe replacement recorded
`envCopied: false`. No secrets were copied into the rehearsal.

The official macOS x64 Node 24.22.2 archive was downloaded and matched its
published SHA-256. A private pnpm and fresh frozen dependency tree were installed
under the project, with a private store. Real native SQLite loads under ABI 137;
`check-runtime-stage.py` records Node/platform/ABI/pnpm/lockfile verification and
opens only an in-memory DB. Results under actual Node 24:

- 1,009 API tests / 62 files; 320 web tests / 19 files; API TypeScript build passed.
- Full static build: 876 pages. Cold build took about 173 seconds; warm builds
  took about 11 seconds, including a verified 512MB V8 heap-cap build.
- Real Node 24 native dependencies were moved through the transaction into a
  different private root; SQLite still answered `42` under ABI 137. The prior
  synthetic dependency fixture was restored, then the real rehearsal tree was
  returned to its original location.
- Six filesystem recovery tests pass: explicit rollback; failed candidate
  health; failure partway through dependency promotion; prior override bytes
  restored; downgrade refused after a source revision change; and wait failure
  leaving the healthy API alone. Service commands are simulated.
- The release recovery suite now covers 17 cases, including no shared Caddy
  restart for an identical config and catalog-aware frontend rollback success
  and build failure.
- The actual production frontend revision also built 876 pages under private
  Node 24 against the current 11-app preview data; all four added detail routes
  and the genuine Nearly public image are present in that isolated output.

The official Linux x64 archive is already downloaded locally and matches
`48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75`.
The official better-sqlite3 release includes
`better-sqlite3-v12.8.0-node-v137-linux-x64.tar.gz` (1,076,792 bytes).
There is no Docker/Podman here, and the Linux binary was **not executed**.
Linux runtime/native/service smoke checks below are mandatory before cutover;
no Linux success is inferred solely from the macOS rehearsal.

## Exact execution order after authorization

Allow a **15-minute attended window**. First authorize runtime installation,
reviewed source commit/push/deployment, and application of the prepared catalog
records. No decision about whether to include Web apps remains. Record the final
approved source revision before execution; changes are currently uncommitted.

### 1. Private tools and baseline snapshot

Create a new owner-private directory such as
`/var/backups/wordbase/2026-11-03-release/` outside all served roots. Stage the
reviewed `deploy/` helpers/templates there, the pinned Linux Node archive,
and the private pnpm `package.json` + `package-lock.json` from the rehearsal.
Do not copy `.env`, credentials, an existing native module or the local Node 25
installation. Check live revision/status/services/disk again. Unexpected
tracked/untracked work stops the release; preserve it rather than deleting it.

Run the reviewed snapshot helper with explicit checkout root:

```sh
ROOT=/var/www/wordbase
PRIVATE=/var/backups/wordbase/2026-11-03-release
TOOLS="$PRIVATE/tools"
WORDBASE_RELEASE_ROOT="$ROOT" bash "$TOOLS/snapshot-release.sh" "$PRIVATE/baseline"
```

Verify snapshot checksums, SQLite integrity and archive extraction. This saves
source, DB, static/uploads, API build and the known runtime entries. The snapshot
helper pauses only the rebuild watcher, waits for an existing build, and resumes
its previous state. API and Caddy remain running. Existing environment and
dependency installation are retained; the runtime transaction separately keeps
all three prior dependency directories and its two prior override files.

### 2. Stage the private runtime, without touching live services/dependencies

As root after authorization, use a new versioned destination; stop if it already
exists unexpectedly. Reverify the transferred archive, extract it under
`/opt/wordbase/runtime`, and keep runtime/tooling root-owned and readable/executable
but not writable by caddy. Do not change system libraries if the binary fails.

```sh
printf '%s  %s\n' 48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75 \
  "$PRIVATE/node-v24.22.2-linux-x64.tar.xz" | sha256sum -c -
install -d -m 755 /opt/wordbase/runtime /opt/wordbase/tooling /opt/wordbase/bin
tar -xJf "$PRIVATE/node-v24.22.2-linux-x64.tar.xz" -C /opt/wordbase/runtime
SDK=/opt/wordbase/runtime/node-v24.22.2-linux-x64
NODE="$SDK/bin/node"
"$NODE" --version                         # must be v24.22.2
PNPM_ROOT=/opt/wordbase/tooling/pnpm-10.28.2
install -d -m 755 "$PNPM_ROOT"
# Copy only the reviewed tooling package.json and package-lock.json here.
cp "$PRIVATE/tooling/package.json" "$PRIVATE/tooling/package-lock.json" "$PNPM_ROOT/"
install -m 600 /dev/null "$PRIVATE/npm-user.conf"
install -m 600 /dev/null "$PRIVATE/npm-global.conf"
"$NODE" "$SDK/lib/node_modules/npm/bin/npm-cli.js" ci --prefix "$PNPM_ROOT" \
  --ignore-scripts --no-audit --no-fund --userconfig "$PRIVATE/npm-user.conf" \
  --globalconfig "$PRIVATE/npm-global.conf" --cache "$PRIVATE/npm-cache"
install -m 755 "$TOOLS/wordbase-pnpm" /opt/wordbase/bin/pnpm
ln -s "$NODE" /opt/wordbase/bin/node        # new path only; never overwrite blindly
```

Build a candidate from the **current production revision**, before source release.
Keep it outside the checkout. The archive paths are an explicit allowlist and
exclude `.env`, data and credentials:

```sh
BASE_REVISION=$(git -C "$ROOT" rev-parse HEAD)
CANDIDATE="$PRIVATE/node24-candidate"
install -d -m 700 "$CANDIDATE"
git -C "$ROOT" archive "$BASE_REVISION" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  packages/api/src packages/api/package.json packages/api/tsconfig.json packages/api/vitest.config.ts \
  packages/web/src packages/web/public packages/web/package.json packages/web/tsconfig.json \
  packages/web/astro.config.mjs packages/web/tailwind.config.mjs packages/web/vitest.config.ts \
  | tar -x -C "$CANDIDATE"
cd "$CANDIDATE"
umask 022
PATH="/opt/wordbase/bin:$PATH" WORDBASE_CACHE_DIR="$PRIVATE/pnpm-cache" \
  /opt/wordbase/bin/pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4
python3 "$TOOLS/check-runtime-stage.py" --root "$ROOT" --stage "$CANDIDATE" \
  --node "$NODE" --pnpm-cli "$PNPM_ROOT/node_modules/pnpm/bin/pnpm.cjs" --platform linux
```

Required result: v24.22.2, Linux x64, ABI 137, pnpm 10.28.2, matching source
revision/manifests/lockfile, and a successful native in-memory query. Installation
or native-load failure stops here with live services and dependencies unchanged.
Do not copy native binaries from the Mac or reuse ABI 108/141 bindings.

### 3. Runtime cutover and its independent rollback boundary

```sh
python3 "$TOOLS/runtime-cutover.py" plan --root "$ROOT" --stage "$CANDIDATE" \
  --backup "$PRIVATE/runtime-before"
python3 "$TOOLS/runtime-cutover.py" apply --root "$ROOT" --stage "$CANDIDATE" \
  --backup "$PRIVATE/runtime-before"
```

The apply helper requires root and the verified Linux stage manifest. It
serializes with release/build locks, pauses the watcher and waits for a build,
stops only Wordbase API, retains all three previous dependency trees, promotes
the Node 24 trees, and installs only the two Wordbase overrides. It checks both
managed-process executable identity and HTTP health. Any caught failure restores
the paired old dependency trees/overrides and prior API/watcher state; DB,
uploads, credentials and other services are never restored or overwritten.

Before any source update, test health, public reads and authenticated read-only
Wordbase operations. If these fail, roll back the **runtime phase**:

```sh
python3 "$TOOLS/runtime-cutover.py" rollback --root "$ROOT" \
  --backup "$PRIVATE/runtime-before"
```

An abrupt host loss/SIGKILL requires inspecting the retained transaction journal
and directories before proceeding; it is not an automatic-recovery guarantee.
The helper refuses a repeated restore and refuses a runtime downgrade after
the source revision changes. This prevents accidentally running the new curated
API with the old native tree or re-enabling old automatic-sync behavior.

### 4. Reviewed source and catalog release

Only after the runtime phase succeeds, deploy the owner-approved committed main
revision with the repository's setup script and project-private PATH:

```sh
ssh norvyn 'PATH=/opt/wordbase/bin:$PATH NODE_OPTIONS=--max-old-space-size=512 bash -s' < deploy/setup.sh
```

Confirm the resulting revision is the approved one. Setup retains the existing
environment and builds against the private runtime/store, with staged frontend
output and failure cleanup. Its unchanged-config check avoids restarting shared
Caddy for this release. If a Caddy config difference appears unexpectedly, stop
and review its host-wide restart impact rather than assuming it is harmless.

Through the existing authenticated app-authoring API/MCP: create and publish
the two reviewed rows in `content/reviewed-apps.json`, apply
`content/reviewed-app-order.json`, and fill only absent keys from
`content/reviewed-app-link-additions.json`. Read rows back; preserve existing
IDs, slugs, links, drafts and unrelated metadata; stop on conflicting existing
rows or destinations. Trigger one normal content rebuild and check its status.
No automatic source build is a substitute for these DB authoring steps.

If the new frontend fails review, use the reviewed **frontend rollback** helper
against the baseline. After catalog publication, rebuild the old frontend
against current app data before promotion, retaining the current public media:

```sh
PATH=/opt/wordbase/bin:$PATH NODE_OPTIONS=--max-old-space-size=512 \
  WORDBASE_RELEASE_ROOT="$ROOT" bash "$TOOLS/restore-release.sh" \
  "$PRIVATE/baseline" --rebuild-current-catalog
```

This preserves all 11 current apps and their added routes while retaining
Node 24, its native dependencies, the reviewed-import API, current DB and uploads.
A failed rollback build leaves the serving output and release source intact.
The faster archived-output mode without that flag is suitable only before the
expanded catalog is published. Do not use runtime rollback after source/catalog
release. A database restore or full API downgrade is separate
work requiring review of post-snapshot writes and sync/webhook isolation.

### 5. Post-release acceptance

Check Wordbase API executable/ABI and service health, rebuild status, exact
approved revision, all existing 829 URLs plus four new app routes, both feeds,
all 60 protected bodies/links, canonical/hreflang/404 behavior, uploads,
search, comments, podcast controls, theme/language and desktop/mobile pages.
Production-safe write checks use isolated tests; do not post test comments or
edit real content to probe health. Preserve ASC root support/privacy URLs,
marketing URLs, DNS, credentials, domains and five existing draft apps.

## Catalog audit and honest media state

The live approved design was re-read directly, then compared with actual local
app records and visible repository rows. All 11 app identities/order match:
eight iOS, two macOS, one Web (Nearly). DoodleHop's stored display title remains
`DoodleHop: Draw & Animate`; its identity and URL are unchanged. All 19 default
repository names/order match; All exposes 31 verified public repositories,
including nine archives and three forks. No private repositories were accessed.

Six original rows lacked the support/privacy metadata shown in the design.
The prepared link-addition manifest and preview fill these exact missing keys,
preserving existing destinations. Model Proxy's verified GitHub source CTA is
also present. Root support/privacy pages already exist and remain protected;
ASC registrations are not changed. Production still has nine published apps
and five drafts; two new rows, ordering and link additions await the authorized
authoring step above. The local preview includes all 11 now.

No real app has assigned promotional video. Nearly uses a real captured public
homepage, and existing screenshot/fallback behavior remains. The excluded EXT4
video and other external-project media were not used. Promotional assets remain
pending genuine Wordbase assets; no demonstration or store listing was fabricated.

Evidence is under ignored `.preview/node24-rehearsal/`: official artifact
verification, native/stage probes, fresh dependency install, API/web tests and
builds, relocation result, six runtime recovery tests, two Caddy tests and the
approved-vs-actual catalog comparison. Linux staging/service acceptance remains
explicitly pending authorization, not falsely reported as completed.
