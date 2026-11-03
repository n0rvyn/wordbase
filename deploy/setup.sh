#!/bin/bash
set -euo pipefail

umask 077
ROOT=${WORDBASE_RELEASE_ROOT:-/var/www/wordbase}
API_PID=
API_STOPPED=0
WATCHER_ACTIVE=0
LOCKED=0
DEPLOY_LOCKED=0
STAGE=
SWAPPING=0
cleanup() {
    result=$?
    trap - EXIT INT TERM
    set +e
    if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null; wait "$API_PID" 2>/dev/null; fi
    if [[ "$SWAPPING" = 1 && -d "$STAGE/previous-web-dist" && ! -e "$ROOT/packages/web/dist" ]]; then
        mv "$STAGE/previous-web-dist" "$ROOT/packages/web/dist" || result=1
    fi
    if [[ "$API_STOPPED" = 1 ]]; then
        sudo systemctl restart wordbase-api || result=1
        sudo systemctl is-active --quiet wordbase-api || result=1
    fi
    if [[ "$LOCKED" = 1 ]]; then exec 9>&-; fi
    if [[ "$WATCHER_ACTIVE" = 1 ]]; then sudo systemctl start wordbase-rebuild.path || result=1; fi
    if [[ "$DEPLOY_LOCKED" = 1 ]]; then exec 8>&-; fi
    if [[ -n "$STAGE" ]]; then echo "Release artifacts retained at $STAGE"; fi
    if [[ "$result" != 0 ]]; then echo "Release failed. Verify live static output and API/watcher recovery before retrying; retained artifacts are listed above." >&2; fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Wordbase deployment script for norvyn server
# Run: ssh norvyn 'bash -s' < deploy/setup.sh

echo "=== Wordbase Deployment ==="
# The frozen release includes better-sqlite3 12.8.0. Node 18 is outside its
# declared engine range; fail before touching the checkout, locks or services.
runtime=$(node --version)
case "$runtime" in
    v20.*|v22.*|v23.*|v24.*|v25.*) ;;
    *) echo "Unsupported runtime $runtime: better-sqlite3 12.8.0 requires Node 20 or 22–25. No deployment changes made." >&2; exit 1 ;;
esac

# 1. Clone or pull repo
if [ -d "$ROOT" ]; then
    echo "[1/10] Updating existing installation..."
    cd "$ROOT"
    git diff --quiet && git diff --cached --quiet || { echo 'Tracked checkout changes must be preserved and reviewed.' >&2; exit 1; }
    # These are the four observed production runtime entries, plus our lock.
    # Do not delete/stash them or silently permit other untracked files.
    while IFS= read -r -d '' entry; do
        case "$entry" in
            packages/api/data/.cache/*|packages/api/data/.local/*|packages/api/data/blog.db.bak-pageviews-20260604-125139|packages/api/data/build-status.json|packages/api/data/.release.lock|packages/api/data/.deployment.lock) ;;
            *) echo "Unaccounted untracked entry: $entry" >&2; exit 1 ;;
        esac
        case "$entry" in
            packages/api/data/.cache/*|packages/api/data/.local/*)
                [[ -f "$entry" || -L "$entry" ]] || { echo "Invalid cache entry: $entry" >&2; exit 1; } ;;
            *) [[ -f "$entry" && ! -L "$entry" ]] || { echo "Invalid runtime entry: $entry" >&2; exit 1; } ;;
        esac
    done < <(git ls-files --others --exclude-standard -z)
    if [ "$(git symbolic-ref --short -q HEAD || true)" != main ]; then
        echo 'Deployment requires the reviewed main branch; refusing a detached or alternate checkout.' >&2
        exit 1
    fi
    command -v flock >/dev/null
    [[ ! -L packages/api/data/.deployment.lock && ! -L packages/api/data/.release.lock ]] || { echo 'Unsafe release lock' >&2; exit 1; }
    exec 8>packages/api/data/.deployment.lock
    flock -n 8 || { echo 'Another deployment/rollback owns the lock.' >&2; exit 1; }
    DEPLOY_LOCKED=1
    if sudo systemctl is-active --quiet wordbase-rebuild.path; then WATCHER_ACTIVE=1; fi
    sudo systemctl stop wordbase-rebuild.path
    # Older production rebuilds do not yet share the lock: let them finish.
    for attempt in $(seq 1 300); do
        state=$(sudo systemctl show --value -p ActiveState wordbase-rebuild.service)
        case "$state" in inactive|failed) break ;; esac
        [[ "$attempt" != 300 ]] || { echo 'Existing rebuild did not finish; release aborted.' >&2; exit 1; }
        sleep 1
   done
    exec 9>packages/api/data/.release.lock
    flock -n 9 || { echo 'Another rebuild owns the lock.' >&2; exit 1; }
    LOCKED=1
    git pull --ff-only origin main
else
    echo "[1/10] Fresh installation..."
    git clone git@github.com:n0rvyn/wordbase.git "$ROOT"
    cd "$ROOT"
    command -v flock >/dev/null
    mkdir -p packages/api/data
    exec 8>packages/api/data/.deployment.lock
    flock -n 8 || exit 1
    DEPLOY_LOCKED=1
    exec 9>packages/api/data/.release.lock
    flock -n 9 || exit 1
    LOCKED=1
fi

# 2. Install dependencies
echo "[2/10] Installing dependencies..."
command -v pnpm >/dev/null
pnpm install --frozen-lockfile

# 3. Build API (TypeScript → JavaScript)
echo "[3/10] Building API..."
cd packages/api
pnpm build

# 4. Initialize database
echo "[4/10] Initializing database..."
mkdir -p data/uploads
pnpm db:migrate

# 5. Create API key if none exists
if [ ! -f "$ROOT/.env" ]; then
    echo "[5/10] Creating initial API key..."
    KEY_OUTPUT=$(pnpm cli key:create admin 2>&1)
    API_KEY=$(echo "$KEY_OUTPUT" | grep "Key:" | awk '{print $2}')
    echo "WORDBASE_API_KEY=$API_KEY" > "$ROOT/.env"
    echo "API key saved to .env (value withheld)."
    echo "SAVE THIS KEY!"
else
    echo "[5/10] .env exists, skipping key creation."
fi

# 6. Build frontend (needs the NEW API running for build-time data fetch)
echo "[6/10] Building frontend..."
cd "$ROOT"/packages/api
source "$ROOT/.env"
# Stop the systemd service FIRST: otherwise it keeps :4100 bound with the OLD
# code, the temp build-time API below can't bind, and the frontend build fetches
# stale data — e.g. a pre-/api/apps build returns 404 for getStaticPaths and the
# whole deploy aborts (set -e). (Deploy postmortem 2026-05-31.)
if sudo systemctl is-active --quiet wordbase-api; then
    API_STOPPED=1
    sudo systemctl stop wordbase-api
fi
node dist/index.js &
API_PID=$!
# Never build against a stale or failed temporary API.
ready=0
for attempt in $(seq 1 30); do
    kill -0 "$API_PID" 2>/dev/null || { echo 'Temporary API exited.' >&2; exit 1; }
    if curl -fsS http://localhost:4100/health >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
done
[[ "$ready" = 1 ]] || { echo 'Temporary API did not become healthy.' >&2; exit 1; }

STAGE=$(mktemp -d "$ROOT/.release-stage.XXXXXX")
cd "$ROOT/packages/web"
# Build away from the served directory. A failed build cannot erase live dist.
pnpm build --outDir "$STAGE/web-dist"
[[ -f "$STAGE/web-dist/index.html" ]] || { echo 'Incomplete frontend build.' >&2; exit 1; }
sudo chown -R caddy:caddy "$STAGE/web-dist"
SWAPPING=1
if [[ -d "$ROOT/packages/web/dist" ]]; then mv "$ROOT/packages/web/dist" "$STAGE/previous-web-dist"; fi
mv "$STAGE/web-dist" "$ROOT/packages/web/dist"
SWAPPING=0
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
API_PID=

# 7. Fix ownership
echo "[7/10] Setting ownership..."
sudo chown -R caddy:caddy "$ROOT"

# 8. SELinux contexts
echo "[8/10] Setting SELinux contexts..."
# Static content (read-only by Caddy)
sudo semanage fcontext -a -t httpd_sys_content_t "$ROOT/packages/web/dist(/.*)?" 2>/dev/null || \
sudo semanage fcontext -m -t httpd_sys_content_t "$ROOT/packages/web/dist(/.*)?"
# Uploads + database (read-write by API server)
sudo semanage fcontext -a -t httpd_sys_rw_content_t "$ROOT/packages/api/data(/.*)?" 2>/dev/null || \
sudo semanage fcontext -m -t httpd_sys_rw_content_t "$ROOT/packages/api/data(/.*)?"
# Apply
sudo restorecon -Rv "$ROOT"

# Existing host web-server/SELinux policy is owner-managed. Do not change it here.

# 9. Install systemd services
echo "[9/10] Installing systemd services..."
sudo cp "$ROOT/deploy/wordbase-api.service" /etc/systemd/system/
# Decoupled rebuild: the API drops a marker, this path unit runs the build
# outside the API sandbox. See deploy/rebuild.sh + build.service.ts.
sudo cp "$ROOT/deploy/wordbase-rebuild.service" /etc/systemd/system/
sudo cp "$ROOT/deploy/wordbase-rebuild.path" /etc/systemd/system/
chmod +x "$ROOT/deploy/rebuild.sh"
sudo systemctl daemon-reload
sudo systemctl enable wordbase-api
sudo systemctl restart wordbase-api
API_STOPPED=0
sudo systemctl enable wordbase-rebuild.path
WATCHER_ACTIVE=1

# 10. Check owner-managed Caddy config; hand off any difference.
echo "[10/10] Checking owner-managed Caddy configuration..."
CADDY_SITE=${WORDBASE_CADDY_SITE:-/etc/caddy/sites.v2/wordbase}
if cmp -s "$ROOT/deploy/wordbase" "$CADDY_SITE"; then
    echo 'Wordbase Caddy configuration unchanged; shared Caddy is not restarted.'
else
    echo 'Caddy configuration differs. Owner review and manual application are required; no Caddy files or services changed.' >&2
    echo 'After reviewing the config difference, the owner can run:' >&2
    printf '  sudo cp %q %q\n' "$ROOT/deploy/wordbase" "$CADDY_SITE" >&2
    echo '  sudo ln -sf wordbase /etc/caddy/sites.v2/wordbase.enable' >&2
    echo '  sudo systemctl restart caddy' >&2
    exit 1
fi

# Verify
echo ""
echo "=== Verification ==="
ready=0
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 2 http://localhost:4100/health >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
done
[[ "$ready" = 1 ]] || { echo 'Managed API did not become healthy after restart.' >&2; exit 1; }
echo -n "API health:   "
curl -fsS --max-time 2 http://localhost:4100/health
echo ""
echo -n "API service:  "
sudo systemctl is-active wordbase-api
echo -n "Caddy status: "
sudo systemctl is-active caddy
echo ""
echo "SELinux contexts:"
ls -Z "$ROOT/packages/web/dist/index.html" 2>/dev/null | awk '{print "  dist:    "$1}'
ls -Z "$ROOT/packages/api/data/blog.db" 2>/dev/null | awk '{print "  data:    "$1}'
echo ""
echo "=== Deployment complete ==="
echo "Visit: https://norvyn.com"
