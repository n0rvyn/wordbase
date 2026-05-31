#!/bin/bash
# WordBase static-site rebuild — runs OUTSIDE the API's sandbox.
#
# Triggered by wordbase-rebuild.path when the API touches
# packages/api/data/.rebuild-request (via /api/build/trigger, publish, or the
# ASC webhook). Builds the Astro site, fixes ownership + SELinux labels so Caddy
# can serve the fresh dist, and records build-status.json for the API to read
# back via GET /api/build/status.
set -uo pipefail

ROOT=/var/www/wordbase
WEB="$ROOT/packages/web"
DATA="$ROOT/packages/api/data"
STATUS="$DATA/build-status.json"

now_ms() { echo $(( $(date +%s%N) / 1000000 )); }

start=$(now_ms)
printf '{"status":"building","startedAt":%s,"completedAt":null,"error":null,"duration":null}\n' "$start" > "$STATUS"

cd "$WEB" || {
  end=$(now_ms)
  printf '{"status":"failed","startedAt":%s,"completedAt":%s,"error":"web dir not found","duration":%s}\n' "$start" "$end" $((end - start)) > "$STATUS"
  exit 1
}

if out=$(ASTRO_TELEMETRY_DISABLED=1 pnpm build 2>&1); then
  # Match the manual-deploy path: Caddy serves dist as the caddy user, and a
  # rebuilt dir can lose its SELinux content label, so re-apply both.
  chown -R caddy:caddy dist
  restorecon -R dist 2>/dev/null || true
  end=$(now_ms)
  printf '{"status":"success","startedAt":%s,"completedAt":%s,"error":null,"duration":%s}\n' "$start" "$end" $((end - start)) > "$STATUS"
else
  end=$(now_ms)
  esc=$(printf '%s' "$out" | tail -c 2000 | python3 -c 'import sys, json; print(json.dumps(sys.stdin.read()))')
  printf '{"status":"failed","startedAt":%s,"completedAt":%s,"error":%s,"duration":%s}\n' "$start" "$end" "$esc" $((end - start)) > "$STATUS"
  exit 1
fi
