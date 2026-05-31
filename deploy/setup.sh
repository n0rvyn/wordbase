#!/bin/bash
set -e

# Wordbase deployment script for norvyn server
# Run: ssh norvyn 'bash -s' < deploy/setup.sh

echo "=== Wordbase Deployment ==="

# 1. Clone or pull repo
if [ -d /var/www/wordbase ]; then
    echo "[1/10] Updating existing installation..."
    cd /var/www/wordbase
    git pull origin main
else
    echo "[1/10] Fresh installation..."
    git clone git@github.com:n0rvyn/wordbase.git /var/www/wordbase
    cd /var/www/wordbase
fi

# 2. Install dependencies
echo "[2/10] Installing dependencies..."
npm install -g pnpm 2>/dev/null || true
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
if [ ! -f /var/www/wordbase/.env ]; then
    echo "[5/10] Creating initial API key..."
    KEY_OUTPUT=$(pnpm cli key:create admin 2>&1)
    API_KEY=$(echo "$KEY_OUTPUT" | grep "Key:" | awk '{print $2}')
    echo "WORDBASE_API_KEY=$API_KEY" > /var/www/wordbase/.env
    echo "API Key saved to .env: $API_KEY"
    echo "SAVE THIS KEY!"
else
    echo "[5/10] .env exists, skipping key creation."
fi

# 6. Build frontend (needs the NEW API running for build-time data fetch)
echo "[6/10] Building frontend..."
cd /var/www/wordbase/packages/api
source /var/www/wordbase/.env
# Stop the systemd service FIRST: otherwise it keeps :4100 bound with the OLD
# code, the temp build-time API below can't bind, and the frontend build fetches
# stale data — e.g. a pre-/api/apps build returns 404 for getStaticPaths and the
# whole deploy aborts (set -e). (Deploy postmortem 2026-05-31.)
sudo systemctl stop wordbase-api 2>/dev/null || true
node dist/index.js &
API_PID=$!
# Wait for the temp API to actually be ready (up to ~30s) instead of a fixed sleep.
for i in $(seq 1 30); do
  curl -sf http://localhost:4100/health >/dev/null 2>&1 && break
  sleep 1
done

cd /var/www/wordbase/packages/web
pnpm build

kill $API_PID 2>/dev/null
wait $API_PID 2>/dev/null || true

# 7. Fix ownership
echo "[7/10] Setting ownership..."
sudo chown -R caddy:caddy /var/www/wordbase

# 8. SELinux contexts
echo "[8/10] Setting SELinux contexts..."
# Static content (read-only by Caddy)
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/wordbase/packages/web/dist(/.*)?" 2>/dev/null || \
sudo semanage fcontext -m -t httpd_sys_content_t "/var/www/wordbase/packages/web/dist(/.*)?"
# Uploads + database (read-write by API server)
sudo semanage fcontext -a -t httpd_sys_rw_content_t "/var/www/wordbase/packages/api/data(/.*)?" 2>/dev/null || \
sudo semanage fcontext -m -t httpd_sys_rw_content_t "/var/www/wordbase/packages/api/data(/.*)?"
# Apply
sudo restorecon -Rv /var/www/wordbase

# Allow Caddy to proxy to Node.js on port 4100
sudo setsebool -P httpd_can_network_connect 1 2>/dev/null || true

# 9. Install systemd services
echo "[9/10] Installing systemd services..."
sudo cp /var/www/wordbase/deploy/wordbase-api.service /etc/systemd/system/
# Decoupled rebuild: the API drops a marker, this path unit runs the build
# outside the API sandbox. See deploy/rebuild.sh + build.service.ts.
sudo cp /var/www/wordbase/deploy/wordbase-rebuild.service /etc/systemd/system/
sudo cp /var/www/wordbase/deploy/wordbase-rebuild.path /etc/systemd/system/
chmod +x /var/www/wordbase/deploy/rebuild.sh
# Ensure the watched marker exists (caddy-owned so the API can rewrite it).
sudo -u caddy touch /var/www/wordbase/packages/api/data/.rebuild-request
sudo systemctl daemon-reload
sudo systemctl enable wordbase-api
sudo systemctl restart wordbase-api
sudo systemctl enable --now wordbase-rebuild.path

# 10. Install Caddy config
echo "[10/10] Installing Caddy configuration..."
sudo cp /var/www/wordbase/deploy/wordbase /etc/caddy/sites.v2/wordbase
sudo ln -sf wordbase /etc/caddy/sites.v2/wordbase.enable
# NOTE: global `admin off` in /etc/caddy/Caddyfile disables the :2019 admin API,
# so `caddy reload` fails ("connection refused"). Must restart to apply config.
sudo systemctl restart caddy

# Verify
echo ""
echo "=== Verification ==="
sleep 2
echo -n "API health:   "
curl -s http://localhost:4100/health || echo "FAILED"
echo ""
echo -n "API service:  "
sudo systemctl is-active wordbase-api
echo -n "Caddy status: "
sudo systemctl is-active caddy
echo ""
echo "SELinux contexts:"
ls -Z /var/www/wordbase/packages/web/dist/index.html 2>/dev/null | awk '{print "  dist:    "$1}'
ls -Z /var/www/wordbase/packages/api/data/blog.db 2>/dev/null | awk '{print "  data:    "$1}'
echo ""
echo "=== Deployment complete ==="
echo "Visit: https://norvyn.com"
