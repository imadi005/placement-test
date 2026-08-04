# Lab-server deployment (single Ubuntu box)

Runs the whole stack — Postgres, Redis, Judge0, backend, frontend, nginx —
on one machine on the college's own network, instead of Render (backend) +
Vercel (frontend) + Neon (DB) + Upstash (Redis) + a separate AWS EC2 box
(Judge0). No cold starts, no internet round-trip for the coding round, no
per-service cloud bills.

## One-time setup, before running the script

1. **Copy the env templates and fill in real secrets** (never commit the
   real files):
   ```bash
   cp deploy/app-stack.env.example deploy/app-stack.env
   nano deploy/app-stack.env        # set real POSTGRES_PASSWORD, REDIS_PASSWORD

   cp judge0/judge0.conf.example judge0/judge0.conf
   nano judge0/judge0.conf          # set real POSTGRES_PASSWORD, REDIS_PASSWORD, AUTHN_TOKEN

   cp backend/.env.example backend/.env
   nano backend/.env                # see the checklist the script prints if this is missing
   ```
2. Know the server's LAN IP (or a hostname if the lab has local DNS) —
   `hostname -I` on the box itself.

## Run it

```bash
chmod +x deploy/lab-server-setup.sh
./deploy/lab-server-setup.sh 192.168.1.50   # your server's LAN IP
```

Re-running it is safe — every step checks whether its target already
exists (container running, `.env` present, pm2 process registered, nginx
site written) before doing anything, so it's the same command whether
this is the first run or you're just restarting things after a reboot.

What it does, in order: installs Docker/Node 20/pm2/nginx if missing →
starts the app's Postgres+Redis (`deploy/docker-compose.app.yml`) → starts
Judge0 (`judge0/docker-compose.yml`, same file the AWS setup used) → builds
and pm2-starts the backend → builds the frontend with
`NEXT_PUBLIC_API_URL` baked in and pm2-starts it → writes and enables an
nginx site fronting the frontend.

After the first successful run, make both pm2 processes survive a reboot:
```bash
pm2 startup   # follow the one printed command it gives you
pm2 save
```

## Architecture note — why nginx only fronts the frontend

The backend (port 4000) and Judge0 (port 2358) are reached directly by the
browser, not proxied through nginx — same relationship as
Vercel-frontend/Render-backend today, just both origins now live on one
LAN box instead of two cloud ones. This avoids rewriting API paths through
an `/api/` prefix and avoids proxying Socket.IO's WebSocket upgrade
handshake through nginx, which is easy to get subtly wrong. On a closed
lab network, three ports instead of one is a fine trade for that
simplicity.

## Firewall

If `ufw` is enabled, students on the LAN need in:
```bash
sudo ufw allow 80/tcp     # frontend (via nginx)
sudo ufw allow 4000/tcp   # backend
sudo ufw allow 2358/tcp   # Judge0
```

## Updating the app later

```bash
git pull
./deploy/lab-server-setup.sh 192.168.1.50   # rebuilds + pm2 restarts both
```

## Logs

```bash
pm2 logs placement-backend
pm2 logs placement-frontend
docker compose -f judge0/docker-compose.yml logs -f server
docker compose -f deploy/docker-compose.app.yml logs -f
```
