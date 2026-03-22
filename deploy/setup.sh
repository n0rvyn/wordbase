#!/bin/bash
set -e

# Wordbase deployment script for norvyn server
# Run: ssh norvyn 'bash -s' < deploy/setup.sh

echo "=== Wordbase Deployment ==="

# 1. Clone or pull repo
if [ -d /var/www/wordbase ]; then
    echo "Updating existing installation..."
    cd /var/www/wordbase
    git pull origin main
else
    echo "Fresh installation..."
    git clone https://github.com/n0rvyn/wordbase.git /var/www/wordbase
    cd /var/www/wordbase
fi

# 2. Install dependencies
echo "Installing dependencies..."
npm install -g pnpm 2>/dev/null || true
pnpm install --frozen-lockfile

# 3. Build API (TypeScript → JavaScript)
echo "Building API..."
cd packages/api
pnpm build

# 4. Initialize database
echo "Initializing database..."
mkdir -p data/uploads
pnpm db:migrate

# 5. Create API key if none exists
if [ ! -f /var/www/wordbase/.env ]; then
    echo "Creating initial API key..."
    KEY_OUTPUT=$(pnpm cli key:create admin 2>&1)
    API_KEY=$(echo "$KEY_OUTPUT" | grep "Key:" | awk '{print $2}')
    echo "WORDBASE_API_KEY=$API_KEY" > /var/www/wordbase/.env
    echo "API Key saved to .env: $API_KEY"
    echo "SAVE THIS KEY!"
fi

# 6. Build frontend (needs API running for data fetch)
echo "Starting API temporarily for build..."
cd /var/www/wordbase/packages/api
source /var/www/wordbase/.env
node dist/index.js &
API_PID=$!
sleep 3

echo "Building frontend..."
cd /var/www/wordbase/packages/web
pnpm build

kill $API_PID 2>/dev/null
wait $API_PID 2>/dev/null

# 7. Install systemd service
echo "Installing systemd service..."
sudo cp /var/www/wordbase/deploy/wordbase-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wordbase-api
sudo systemctl restart wordbase-api

# 8. Install Caddy config
echo "Installing Caddy configuration..."
sudo cp /var/www/wordbase/deploy/blog.norvyn.com.caddy /etc/caddy/sites.v2/blog.norvyn.com.enable
sudo systemctl reload caddy

# 9. Fix permissions
echo "Setting permissions..."
sudo chown -R caddy:caddy /var/www/wordbase

# 10. Verify
echo ""
echo "=== Verification ==="
sleep 2
echo -n "API health: "
curl -s http://localhost:4100/health || echo "FAILED"
echo ""
echo -n "Caddy status: "
sudo systemctl is-active caddy
echo -n "API service: "
sudo systemctl is-active wordbase-api
echo ""
echo "=== Deployment complete ==="
echo "Visit: https://blog.norvyn.com"
