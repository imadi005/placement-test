#!/usr/bin/env bash
# One-shot (and re-runnable) setup for hosting the whole placement-test-portal
# stack on a single Ubuntu lab server: Postgres + Redis (replacing Neon +
# Upstash), Judge0 (replacing the AWS EC2 box), the NestJS backend, the
# Next.js frontend, and nginx in front of the frontend.
#
# Assumes Ubuntu 22.04/24.04. Safe to re-run — every step checks whether its
# target already exists before doing anything.
#
# Usage:
#   ./lab-server-setup.sh [server-ip-or-hostname]
#
# The optional argument becomes both nginx's server_name and the host half
# of NEXT_PUBLIC_API_URL (http://<that>:4000) baked into the frontend build.
# Omit it and the script defaults to this machine's first LAN IP.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
SERVER_HOST="${1:-$(hostname -I 2>/dev/null | awk '{print $1}')}"

if [ -z "$SERVER_HOST" ]; then
  echo "Couldn't auto-detect a LAN IP — pass one explicitly: ./lab-server-setup.sh 192.168.1.50"
  exit 1
fi

echo "==> Using server host: $SERVER_HOST"

# --- 1. Docker ---------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. If subsequent 'docker' commands in THIS script"
  echo "    fail with a permission error, log out/in once and re-run."
else
  echo "==> Docker already installed, skipping"
fi

# --- 2. Node.js 20 LTS ---------------------------------------------------
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "==> Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node.js already installed ($(node -v)), skipping"
fi

# --- 3. pm2 + nginx -------------------------------------------------------
if ! command -v pm2 &>/dev/null; then
  echo "==> Installing pm2"
  sudo npm install -g pm2
else
  echo "==> pm2 already installed, skipping"
fi

if ! command -v nginx &>/dev/null; then
  echo "==> Installing nginx"
  sudo apt-get update -y
  sudo apt-get install -y nginx
else
  echo "==> nginx already installed, skipping"
fi

# --- 4. App-level Postgres + Redis ---------------------------------------
if [ ! -f "$DEPLOY_DIR/app-stack.env" ]; then
  echo "!! $DEPLOY_DIR/app-stack.env is missing."
  echo "   cp deploy/app-stack.env.example deploy/app-stack.env, fill in real"
  echo "   passwords, then re-run this script."
  exit 1
fi

echo "==> Starting app Postgres + Redis"
(cd "$DEPLOY_DIR" && docker compose -f docker-compose.app.yml up -d)

# --- 5. Judge0 ------------------------------------------------------------
if [ ! -f "$REPO_ROOT/judge0/judge0.conf" ]; then
  echo "!! $REPO_ROOT/judge0/judge0.conf is missing."
  echo "   cp judge0/judge0.conf.example judge0/judge0.conf, fill in real"
  echo "   POSTGRES_PASSWORD/REDIS_PASSWORD/AUTHN_TOKEN, then re-run."
  exit 1
fi

echo "==> Starting Judge0 (db+redis first, then server+workers)"
(cd "$REPO_ROOT/judge0" && docker compose up -d db redis)
sleep 10
(cd "$REPO_ROOT/judge0" && docker compose up -d)

echo "==> Waiting for Judge0 to answer..."
for i in $(seq 1 12); do
  if curl -fsS http://localhost:2358/languages >/dev/null 2>&1; then
    echo "    Judge0 is up."
    break
  fi
  sleep 5
  if [ "$i" -eq 12 ]; then
    echo "!! Judge0 didn't answer after a minute — check 'docker compose -f judge0/docker-compose.yml logs server'."
  fi
done

# --- 6. Backend -------------------------------------------------------
if [ ! -f "$REPO_ROOT/backend/.env" ]; then
  echo "!! $REPO_ROOT/backend/.env is missing."
  echo "   cp backend/.env.example backend/.env, then set at minimum:"
  echo "     DATABASE_URL=\"postgresql://<user>:<pass>@localhost:5432/placement_test_portal\""
  echo "     REDIS_URL=\"redis://:<pass>@localhost:6379\""
  echo "     JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (openssl rand -hex 32)"
  echo "     FRONTEND_URL=\"http://$SERVER_HOST\""
  echo "     JUDGE0_URL=\"http://localhost:2358\""
  echo "     JUDGE0_AUTH_TOKEN=<same value as AUTHN_TOKEN in judge0/judge0.conf>"
  echo "     RESEND_API_KEY / RESEND_FROM (a verified domain, not onboarding@resend.dev)"
  echo "   then re-run this script."
  exit 1
fi

echo "==> Installing + building backend"
(cd "$REPO_ROOT/backend" && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build)

echo "==> Starting backend under pm2"
(cd "$REPO_ROOT/backend" && pm2 start dist/src/main.js --name placement-backend --update-env || pm2 restart placement-backend --update-env)

# --- 7. Frontend -------------------------------------------------------
echo "==> Building frontend (NEXT_PUBLIC_API_URL=http://$SERVER_HOST:4000)"
(cd "$REPO_ROOT" && NEXT_PUBLIC_API_URL="http://$SERVER_HOST:4000" npm ci && NEXT_PUBLIC_API_URL="http://$SERVER_HOST:4000" npm run build)

echo "==> Starting frontend under pm2"
(cd "$REPO_ROOT" && pm2 start npm --name placement-frontend --update-env -- start || pm2 restart placement-frontend --update-env)

pm2 save
echo "==> Run 'pm2 startup' once and follow its printed instructions so both"
echo "    processes survive a server reboot."

# --- 8. nginx -------------------------------------------------------
NGINX_SITE=/etc/nginx/sites-available/placement-test-portal
if [ ! -f "$NGINX_SITE" ]; then
  echo "==> Writing nginx config for $SERVER_HOST"
  sed "s/SERVER_NAME_OR_IP/$SERVER_HOST/" "$DEPLOY_DIR/nginx-frontend.conf.example" | sudo tee "$NGINX_SITE" >/dev/null
  sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/placement-test-portal
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
else
  echo "==> nginx site already exists at $NGINX_SITE, leaving it alone"
fi

echo ""
echo "==> Done. Students on the LAN should reach the app at:"
echo "    http://$SERVER_HOST"
echo "    (backend directly at http://$SERVER_HOST:4000, Judge0 at http://$SERVER_HOST:2358)"
