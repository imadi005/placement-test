# Lab server deployment — complete step-by-step guide

Follow this top to bottom, in order, on a fresh Ubuntu terminal with sudo
access. Every secret file needed is already generated and sitting in this
repo (`deploy/app-stack.env`, `judge0/judge0.conf`, `deploy/backend.env.lab`)
— you're not creating or typing any passwords yourself, just moving 3 files
onto the server and changing one line.

---

## Step 0 — What you need before starting

- A terminal on the lab server (SSH or physically at the machine), with
  `sudo` access.
- Your own laptop (the one with this repo on it) reachable to `scp` files
  from, OR a USB drive if the server has no network path to your laptop.
- 15-20 minutes, most of it waiting for `apt`/`docker pull`/`npm install`.

---

## Step 1 — Confirm the server is what you think it is

On the **server terminal**:

```bash
whoami
sudo -v
lsb_release -a
hostname -I
```

- `sudo -v` should just ask for your password and return with no error —
  if it says "not in the sudoers file," stop and get proper access first.
- `lsb_release -a` should say Ubuntu 22.04 or 24.04. If it's something
  else, the setup script (which assumes Ubuntu/`apt`) needs changes —
  come back and tell me what it says.
- `hostname -I` prints one or more IPs — the **first one** is this
  machine's LAN IP. Write it down, you'll use it repeatedly below. This
  guide calls it `<SERVER_IP>` — replace every occurrence with the real
  value (e.g. `192.168.1.50`).

---

## Step 2 — Get the code onto the server

On the **server terminal**:

```bash
sudo apt-get update -y
sudo apt-get install -y git
```

Then clone the repo. If it's a **private** GitHub repo, you need a
Personal Access Token first:
- On GitHub (any browser): Settings → Developer settings → Personal
  access tokens → Tokens (classic) → Generate new token → tick the
  `repo` scope → Generate → copy the token (starts with `ghp_...`).
- Then on the server:
  ```bash
  git clone https://<paste-your-token>@github.com/imadi005/placement-test.git
  cd placement-test
  ```

If the repo is public, simpler:
```bash
git clone https://github.com/imadi005/placement-test.git
cd placement-test
```

You should now be inside the `placement-test` folder — confirm with `pwd`
and `ls` (you should see `app/`, `backend/`, `deploy/`, `judge0/`, etc.).

---

## Step 3 — Move the 3 pre-filled secret files onto the server

These 3 files already exist **on your laptop**, inside this repo, with
real generated passwords already in them (never committed to git — they're
in `.gitignore`):

- `deploy/app-stack.env`
- `judge0/judge0.conf`
- `deploy/backend.env.lab`

From a terminal **on your laptop** (not the server), in this repo's root
folder, run:

```bash
scp deploy/app-stack.env deploy/backend.env.lab judge0/judge0.conf ubuntu@<SERVER_IP>:~/placement-test/
```

(Replace `ubuntu` with whatever your actual login user on the server is,
if different. It'll ask for that user's password or use your SSH key.)

If your laptop can't reach the server directly (different network, no
SSH), copy those 3 files onto a USB drive instead and move them onto the
server that way — content is identical either way.

---

## Step 4 — Put the 3 files in their correct final locations

Back on the **server terminal**, inside `~/placement-test`:

```bash
mv ~/app-stack.env deploy/app-stack.env
mv ~/judge0.conf judge0/judge0.conf
mv ~/backend.env.lab backend/.env
```

(If `scp` in Step 3 landed them somewhere other than your home directory,
adjust the source paths above accordingly — check with `ls ~`.)

---

## Step 5 — The one line you actually have to edit

Open the backend env file:
```bash
nano backend/.env
```

Find this line near the top:
```
FRONTEND_URL="http://SERVER_IP"
```

Replace `SERVER_IP` with the real IP from Step 1, e.g.:
```
FRONTEND_URL="http://192.168.1.50"
```

Save and exit: `Ctrl+O`, then `Enter`, then `Ctrl+X`.

That's the only edit needed anywhere. Every password, JWT secret, Judge0
token, and the Resend email API key is already correctly filled in and
already matches across all 3 files.

---

## Step 6 — Run the setup script

```bash
chmod +x deploy/lab-server-setup.sh
./deploy/lab-server-setup.sh <SERVER_IP>
```

(Same `<SERVER_IP>` as before, e.g. `./deploy/lab-server-setup.sh 192.168.1.50`)

This one command installs Docker, Node.js 20, pm2, and nginx (skipping
anything already installed), then in order:
1. Starts the app's Postgres + Redis containers.
2. Starts Judge0 (its own Postgres/Redis + the judge0 server/workers).
3. Installs backend dependencies, runs the database migrations, builds
   the backend, and starts it under `pm2`.
4. Builds the frontend (with the server's IP baked in) and starts it
   under `pm2`.
5. Writes and enables the nginx config that fronts the app.

It prints `==>` lines as it goes. **If it stops with a `!!` error**, it's
telling you exactly what's missing (usually a file it expects that isn't
there) — fix that specific thing and just run the same command again; the
script is safe to re-run from scratch, it skips anything already done.

This step takes the longest (Docker image pulls, npm installs, Next.js
build) — 10-15 minutes is normal on a modest machine. Don't panic if it
looks stuck at `npm ci` or a `docker pull` for a couple minutes.

### A known Judge0 gotcha (only if code submissions fail later)

If, once everything's running, every coding-round submission comes back
"Internal Error" regardless of what code is submitted, it's a known Judge0
sandbox issue on Ubuntu 22.04/24.04 kernels (cgroups v2 only). Fix:
```bash
sudo nano /etc/default/grub
# find GRUB_CMDLINE_LINUX_DEFAULT="" and change it to:
# GRUB_CMDLINE_LINUX_DEFAULT="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
```
After it reboots, reconnect and re-run `./deploy/lab-server-setup.sh <SERVER_IP>` once more (it'll just confirm everything's already up).

---

## Step 7 — Load the real student/coordinator accounts

The database is empty right after Step 6 (migrations only create empty
tables, no accounts). Seed it with the real student roster + coordinator/
admin logins that are already part of this repo:

```bash
cd backend
npx prisma db seed
cd ..
```

This creates the real 315-student roster (extracted from the college's
own placement-training sheet), plus coordinator and admin accounts.
**Every seeded account's password is `Password123!`** — usernames are
each person's roll number (students) or college email (staff). Tell
students/coordinators to change their password after first login if the
app prompts for it.

---

## Step 8 — Verify it's actually working

From the **server itself**, confirm each piece answers:
```bash
curl http://localhost:4000/health          # backend -> {"status":"ok"}
curl http://localhost:2358/languages       # judge0 -> a JSON array of languages
curl -I http://localhost:3000              # frontend -> HTTP/1.1 200 OK
```

Then from **any other device on the same LAN/Wi-Fi** (phone, another
laptop), open a browser and go to:
```
http://<SERVER_IP>
```
You should see the login page. Log in with a seeded roll number/email and
`Password123!` to confirm end to end.

---

## Step 9 — Firewall (only if `ufw` is turned on)

Check first:
```bash
sudo ufw status
```
If it says "Status: active", open the 3 ports students/coordinators need:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 4000/tcp
sudo ufw allow 2358/tcp
```
If it says "Status: inactive", nothing to do here.

---

## Step 10 — Make it survive a reboot

Run once:
```bash
pm2 startup
```
It prints one specific command starting with `sudo env PATH=...` — copy
that exact line it gives you and run it. Then:
```bash
pm2 save
```
Now both the backend and frontend auto-start if the server ever restarts.
Docker containers (Postgres/Redis/Judge0) already have `restart: always`
set, so they come back on their own too.

---

## Everyday commands, once it's all running

**Check status of everything:**
```bash
pm2 status
docker compose -f deploy/docker-compose.app.yml ps
docker compose -f judge0/docker-compose.yml ps
```

**Read logs when something's wrong:**
```bash
pm2 logs placement-backend
pm2 logs placement-frontend
docker compose -f judge0/docker-compose.yml logs -f server
docker compose -f deploy/docker-compose.app.yml logs -f
```

**Restart something:**
```bash
pm2 restart placement-backend
pm2 restart placement-frontend
docker compose -f judge0/docker-compose.yml restart
```

**Deploy a code update later** (once you `git pull` new changes):
```bash
git pull
./deploy/lab-server-setup.sh <SERVER_IP>
```
Same command as Step 6 — it rebuilds and restarts only what actually
changed.

---

## If something in Steps 1-6 breaks

Copy-paste the exact error text here and I'll tell you exactly what to
run next — don't guess/skip ahead, the script's checks exist so a missing
step fails loudly instead of silently breaking something three steps
later.
