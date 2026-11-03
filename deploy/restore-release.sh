#!/bin/bash
# An explicit, attended production rollback. Never invoked by setup or preview.
# Usage: bash deploy/restore-release.sh /absolute/private/snapshot-directory
# Restores frontend source/output only. Retains reviewed-import API, current
# content DB, uploads and environment; old API code would re-enable autosync.
set -euo pipefail
helper_dir=$(cd "$(dirname "$0")" && pwd)
root=${WORDBASE_RELEASE_ROOT:-$(cd "$helper_dir/.." && pwd)}
root=$(cd "$root" && pwd -P)
snapshot=${1:?Provide the snapshot created before the release}
mode=${2:-}
[[ -z "$mode" || "$mode" = --rebuild-current-catalog ]] || { echo 'Unknown rollback mode' >&2; exit 1; }
[[ "$snapshot" = /* && -d "$snapshot" ]] || { echo 'Snapshot must be an existing absolute directory' >&2; exit 1; }
python3 "$helper_dir/release_guard.py" inventory "$root" >/dev/null
revision=$(cat "$snapshot/revision.txt")
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid snapshot revision' >&2; exit 1; }
git -C "$root" cat-file -e "$revision^{commit}"
# Ignore only root package version fields; all dependency/build inputs stay exact.
python3 "$helper_dir/release_guard.py" dependencies "$root" "$revision"
python3 - "$snapshot" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
for name, expected in json.loads((root / 'sha256.json').read_text()).items():
    path = root / name
    assert path.parent == root and path.is_file() and not path.is_symlink(), name
    digest=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''): digest.update(chunk)
    assert digest.hexdigest() == expected, name
PY
# Verify extraction before stopping the rebuild watcher. Never restore the
# snapshot's uploads/database/API: preserve current content and import review.
stage=$(mktemp -d "$root/.rollback-stage.XXXXXX")
watcher=0
swapping=0
source_changed=0
complete=0
cleanup() {
    result=$?
    trap - EXIT INT TERM
    set +e
    if [[ "$swapping" = 1 && ! -e "$root/packages/web/dist" && -d "$stage/failed-web-dist" ]]; then mv "$stage/failed-web-dist" "$root/packages/web/dist" || result=1; fi
    if [[ "$result" != 0 && "$source_changed" = 1 && "$complete" = 0 ]]; then git -C "$root" restore --source HEAD --worktree -- packages/web || result=1; fi
    exec 9>&-
    if [[ "$watcher" = 1 ]]; then sudo systemctl start wordbase-rebuild.path || result=1; fi
    exec 8>&-
    echo "Rollback staging artifacts retained at $stage"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
tar -xzf "$snapshot/static-and-uploads.tgz" -C "$stage" packages/web/dist
[[ -f "$stage/packages/web/dist/index.html" ]] || { echo 'Incomplete rollback artifacts' >&2; exit 1; }
[[ ! -L "$root/packages/api/data/.deployment.lock" && ! -L "$root/packages/api/data/.release.lock" ]] || exit 1
exec 8>"$root/packages/api/data/.deployment.lock"
flock -n 8 || { echo 'Another deployment/rollback is active.' >&2; exit 1; }
if sudo systemctl is-active --quiet wordbase-rebuild.path; then watcher=1; fi
sudo systemctl stop wordbase-rebuild.path
for attempt in $(seq 1 300); do
    state=$(sudo systemctl show --value -p ActiveState wordbase-rebuild.service)
    case "$state" in inactive|failed) break ;; esac
    [[ "$attempt" != 300 ]] || { echo 'Existing rebuild did not finish.' >&2; exit 1; }
    sleep 1
done
exec 9>"$root/packages/api/data/.release.lock"
flock -n 9 || { echo 'Another rebuild is active.' >&2; exit 1; }
# Restore only frontend source, so future content rebuilds keep the old design
# while the running API continues to enforce reviewed imports. The intentional
# tracked diff makes setup/snapshot refuse an unattended follow-up release.
source_changed=1
git -C "$root" restore --source "$revision" --worktree -- packages/web
promotion="$stage/packages/web/dist"
if [[ "$mode" = --rebuild-current-catalog ]]; then
    # New catalog records may refer to newly committed public media. Keep it,
    # and build old frontend source against current API/data before promotion.
    git -C "$root" restore --source HEAD --worktree -- packages/web/public
    (cd "$root/packages/web" && pnpm build --outDir "$stage/catalog-web-dist")
    [[ -f "$stage/catalog-web-dist/index.html" ]] || { echo 'Incomplete current-catalog rollback build' >&2; exit 1; }
    promotion="$stage/catalog-web-dist"
fi
swapping=1
if [[ -e "$root/packages/web/dist" ]]; then mv "$root/packages/web/dist" "$stage/failed-web-dist"; fi
mv "$promotion" "$root/packages/web/dist"
swapping=0
sudo chown -R caddy:caddy "$root/packages/web/dist"
sudo restorecon -R "$root/packages/web/dist" 2>/dev/null || true
complete=1
echo "Restored frontend from $revision. Reviewed-import API, database, uploads and environment retained."
echo 'Frontend source now intentionally differs from HEAD. Review it before the next release.'
echo 'Verify protected routes, feeds and services before ending the release window.'
