#!/bin/bash
# Run on the production host immediately BEFORE an authorized release.
# Usage: bash deploy/snapshot-release.sh /absolute/private/backup-directory
# Creates a consistent SQLite backup and copies release artifacts; does not
# modify the live DB, pull code, or deploy anything. It pauses only the
# rebuild watcher and restores its prior state; API and Caddy remain running.
set -euo pipefail
umask 077
helper_dir=$(cd "$(dirname "$0")" && pwd)
root=${WORDBASE_RELEASE_ROOT:-$(cd "$helper_dir/.." && pwd)}
root=$(cd "$root" && pwd -P)
destination=${1:?Provide an absolute new backup directory}
[[ "$destination" = /* ]] || { echo 'Backup directory must be absolute' >&2; exit 1; }
destination=$(python3 - "$root" "$destination" <<'PY'
import os, sys
root, destination = map(os.path.realpath, sys.argv[1:])
if os.path.commonpath([root, destination]) == root:
    raise SystemExit('Backup must be outside the checkout and all served content roots')
print(destination)
PY
)
[[ ! -e "$destination" ]] || { echo 'Backup directory already exists; refusing to overwrite' >&2; exit 1; }
python3 "$helper_dir/release_guard.py" inventory "$root" >/dev/null
[[ ! -L "$root/packages/api/data/.deployment.lock" && ! -L "$root/packages/api/data/.release.lock" ]] || exit 1
exec 8>"$root/packages/api/data/.deployment.lock"
flock -n 8 || { echo 'Another deployment/rollback is active.' >&2; exit 1; }
watcher=0
cleanup() {
    result=$?
    trap - EXIT INT TERM
    set +e
    exec 9>&-
    if [[ "$watcher" = 1 ]]; then sudo systemctl start wordbase-rebuild.path || result=1; fi
    exec 8>&-
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if sudo systemctl is-active --quiet wordbase-rebuild.path; then watcher=1; fi
sudo systemctl stop wordbase-rebuild.path
# Legacy production rebuilds do not share the lock: wait without killing them.
for attempt in $(seq 1 300); do
    state=$(sudo systemctl show --value -p ActiveState wordbase-rebuild.service)
    case "$state" in inactive|failed) break ;; esac
    [[ "$attempt" != 300 ]] || { echo 'Existing rebuild did not finish.' >&2; exit 1; }
    sleep 1
done
exec 9>"$root/packages/api/data/.release.lock"
flock -n 9 || { echo 'A content rebuild is active.' >&2; exit 1; }
inventory=$(python3 "$helper_dir/release_guard.py" inventory "$root")
[[ -f "$root/packages/api/data/blog.db" && -d "$root/packages/web/dist" ]] || { echo 'Production data/static output missing' >&2; exit 1; }
mkdir -p "$destination"
printf '%s\n' "$inventory" > "$destination/runtime-inventory.json"
python3 - "$root" "$destination/runtime-entries.tgz" <<'PYRUNTIME'
import sys,tarfile
from pathlib import Path
root=Path(sys.argv[1])
with tarfile.open(sys.argv[2], "w:gz", dereference=False) as archive:
    for name in (".cache", ".local", "blog.db.bak-pageviews-20260604-125139", "build-status.json"):
        path=root/"packages/api/data"/name
        if path.exists(): archive.add(path, arcname=str(path.relative_to(root)))
PYRUNTIME
git -C "$root" rev-parse HEAD > "$destination/revision.txt"
git -C "$root" archive HEAD > "$destination/source.tar"
python3 - "$root/packages/api/data/blog.db" "$destination/blog.db" <<'PY'
import sqlite3, sys
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri() + '?mode=ro', uri=True) as source:
    with sqlite3.connect(sys.argv[2]) as target:
        source.backup(target)
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
PY
tar -C "$root" -czf "$destination/static-and-uploads.tgz" packages/web/dist packages/api/data/uploads
# Keep a directly restorable API build; no dependency installation is needed
# for rollback when package/lockfile inputs have stayed unchanged.
tar -C "$root" -czf "$destination/api-build.tgz" packages/api/dist
python3 - "$destination" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
def digest(path):
    result=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''): result.update(chunk)
    return result.hexdigest()
manifest = {p.name: digest(p) for p in root.iterdir() if p.is_file()}
(root / 'sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY
echo "Snapshot complete: $destination"
echo 'API, Caddy and live content retained. Rebuild watcher resumes its prior state. Retain environment and dependencies.'
