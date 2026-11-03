#!/bin/bash
# Content rebuilds and releases share a lock; failed builds never replace dist.
set -euo pipefail
ROOT=${WORDBASE_RELEASE_ROOT:-/var/www/wordbase}
WEB="$ROOT/packages/web"
DATA="$ROOT/packages/api/data"
STATUS="$DATA/build-status.json"
REQUEST="$DATA/.rebuild-request"
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
stage=
start=
out=
swapping=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  set +e
  if [[ "$swapping" = 1 && ! -e "$WEB/dist" && -d "$stage/previous-web-dist" ]]; then mv "$stage/previous-web-dist" "$WEB/dist" || result=1; fi
  if [[ "$result" != 0 && -n "$start" ]]; then
    end=$(now_ms)
    esc=$(printf '%s' "${out:-Rebuild interrupted or artifact installation failed}" | tail -c 2000 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
    printf '{"status":"failed","startedAt":%s,"completedAt":%s,"error":%s,"duration":%s}\n' "$start" "$end" "$esc" "$((end-start))" > "$STATUS"
  fi
  if [[ -n "$stage" ]]; then
    if [[ "$result" = 0 ]]; then rm -rf -- "$stage"; else echo "Failed rebuild artifacts retained at $stage" >&2; fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ ! -L "$DATA/.release.lock" ]] || { echo 'Unsafe build lock' >&2; exit 1; }
exec 9>"$DATA/.release.lock"
flock -w 300 9 || { echo 'Release/build lock timed out; request retained.' >&2; exit 1; }
# Consume only after the lock. Requests arriving while building stay queued.
rm -f "$REQUEST"
start=$(now_ms)
printf '{"status":"building","startedAt":%s,"completedAt":null,"error":null,"duration":null}\n' "$start" > "$STATUS"
cd "$WEB"
stage=$(mktemp -d "$WEB/.rebuild-stage.XXXXXX")
if out=$(ASTRO_TELEMETRY_DISABLED=1 pnpm build --outDir "$stage/web-dist" 2>&1); then
  [[ -f "$stage/web-dist/index.html" ]] || { out='Incomplete frontend build'; exit 1; }
  chown -R caddy:caddy "$stage/web-dist"
  swapping=1
  if [[ -d dist ]]; then mv dist "$stage/previous-web-dist"; fi
  mv "$stage/web-dist" dist
  swapping=0
  restorecon -R dist 2>/dev/null || true
  end=$(now_ms)
  printf '{"status":"success","startedAt":%s,"completedAt":%s,"error":null,"duration":%s}\n' "$start" "$end" "$((end-start))" > "$STATUS"
else
  exit 1
fi
