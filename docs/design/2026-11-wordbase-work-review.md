# Wordbase Work reconciliation and private review

Date: 2026-11-03. Workspace: `/Users/norvyn/Code/Projects/wordbase`.

The earlier Wordbase redesign checkout and this workspace share base commit `d5779441b54ea567c450c090d22ec2035be34b7b`. Its saved `.preview/wordbase-public-redesign.patch` exactly matched its current 55-file Git diff. The patch passed `git apply --check` before application here; all 55 resulting files were byte-identical to that checkout immediately after reconciliation. No commits, branch resets, production deployments or ASC changes were performed.

The seven pre-existing files under `docs/content-updates/` retain their SHA-256 hashes. Evidence: `.preview/preserved-content-before.json`. The previous checkout was read only for this explicit Wordbase handoff and remains unchanged. No other projects or broad home/Library paths were searched. External-project video copies, the `verified-media` directory and media fixture assets were not imported or used. Real app promotional media remains pending selection from Wordbase assets; the catalog retains its existing screenshot fallback.

## Workspace verification

- API: 62 files, 1,008 tests passed; TypeScript build passed.
- Web: 19 files, 316 tests passed; static build completed with 872 pages.
- Astro source check: zero errors, zero warnings, six hints.
- Saved baseline comparison: 829 public URLs, 60 protected privacy/support/terms pages and two feeds passed with zero failures. No new production baseline capture was performed.
- Deployment shell syntax, Python syntax and `git diff --check` passed.
- Browser checks against this workspace at 320px: English home, app catalog and search have no horizontal overflow. macOS filtering returns only Model Proxy; cached `AI` search returns 20 results. Light theme applies and remains selected after navigation. Initial System mode resolved to dark; viewport override was reset after verification.

Logs from these reruns use `.preview/work-*`; earlier imported logs and screenshots remain historical evidence, as described in `2026-11-public-redesign-verification.md`. The synthetic media playback and rollback rehearsals in that earlier report were not rerun here.

## Local review

The read-only offline preview was started from this workspace at `http://127.0.0.1:4413/en`. It serves the frozen public GET cache and rejects writes. It never forwards credentials. The earlier server at port 4410 was not altered.

To restart from the workspace:

```sh
python3 scripts/preview-readonly.py --port 4413 --offline
```

For a rebuild, use a working Node runtime on PATH and the preview-specific settings `API_URL=http://127.0.0.1:4413 PUBLIC_SITE_URL=http://127.0.0.1:4413`. The host's default Homebrew Node cannot start because its llhttp library is missing. The existing Wordbase preview runtime was copied under ignored `.preview/runtime/`; no system installation was changed. Loopback server/build access required the execution environment's network permission.

## Hosted review blocker

Sites readback confirmed `appgprj_6ae96311a27081919186bc0ad7e9ccd6` (Wordbase — private design review) remains owner-only, with no external visitors, saved versions or deployed URL. A source credential was requested without changing its access policy. The first source-opening attempt failed DNS resolution in the sandbox. Automatic approval review denied the network-enabled retry before execution because connecting the helper could upload private source without explicit source-disclosure authorization. No source push, save or hosted deployment succeeded. The Site remains unpublished.

The blocked action is the Sites source helper connecting to this Site's Git repository at `git.chatgpt-team.site`. Explicit approval to upload Wordbase review source and publish it to this owner-only Site is required before retrying that action. No workaround was attempted. A hosted artifact still needs preparation and verification after that gate; local preview success does not establish a hosted release.

Production release remains separately gated by owner preview review and explicit release authorization. Existing public URLs and ASC settings are preserved; admin and subdomain redesign remain deferred.
