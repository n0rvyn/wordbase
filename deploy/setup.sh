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

# 6. Build frontend (needs API running for data fetch)
echo "[6/10] Building frontend..."
cd /var/www/wordbase/packages/api
source /var/www/wordbase/.env
node dist/index.js &
API_PID=$!
sleep 3

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

# 9. Install systemd service
echo "[9/10] Installing systemd service..."
sudo cp /var/www/wordbase/deploy/wordbase-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wordbase-api
sudo systemctl restart wordbase-api

# 10. Install Caddy config
echo "[10/10] Installing Caddy configuration..."
sudo cp /var/www/wordbase/deploy/wordbase /etc/caddy/sites.v2/wordbase
sudo ln -sf wordbase /etc/caddy/sites.v2/wordbase.enable
sudo systemctl reload caddy

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
echo "Visit: https://blog.norvyn.com"
