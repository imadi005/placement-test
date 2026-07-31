# Judge0 — self-hosted code execution (AWS EC2)

Judge0 is the sandbox that actually compiles and runs student-submitted
code (C/C++/Java/Python) for the coding rounds. It needs a real
Docker-capable host — the Render free web service the rest of this app
runs on can't run Docker containers, so this has to live on its own
machine. These steps use AWS EC2 since that's where you have credits.

## 1. Launch the EC2 instance

In the AWS Console → EC2 → Launch instance:

- **AMI**: Ubuntu Server 22.04 LTS (or 24.04 LTS)
- **Instance type**: `t3.small` (2 GiB RAM) is the minimum that's actually
  comfortable — Judge0's workers compile C++/Java, which is memory-hungry
  for a moment during compilation. `t3.medium` (4 GiB) gives real headroom
  if you expect students to hit it concurrently. Both are covered by your
  credits.
- **Key pair**: create/select one — you'll need it to SSH in.
- **Storage**: use at least **30 GiB** gp3 — the Judge0 image alone is
  ~3.3 GB, and the default 8 GiB root volume runs out of space mid-pull
  (`no space left on device`). If you already launched with 8 GiB: EC2 →
  Volumes → select the volume → Actions → Modify volume → resize to 30,
  then on the instance: `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`
  (no reboot needed).

### Security group

Create a security group with:
- **SSH (22)** — source: "My IP" (not 0.0.0.0/0)
- **Custom TCP (2358)** — this is Judge0's port. See the auth note below
  before deciding whether to open this to 0.0.0.0/0 or restrict it.

### Elastic IP (recommended)

Allocate an Elastic IP and associate it with the instance, so the address
doesn't change if you ever stop/start it — otherwise you'd have to update
`JUDGE0_URL` every time. EC2 → Elastic IPs → Allocate → Associate.

## 2. Install Docker

SSH in (`ssh -i your-key.pem ubuntu@<elastic-ip>`), then:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in (or `newgrp docker`), then:
docker compose version
```

## 3. Deploy Judge0

```bash
mkdir judge0 && cd judge0
# copy docker-compose.yml and judge0.conf.example from this repo's judge0/ folder onto the instance
# (scp them up, or paste via nano — either works)
cp judge0.conf.example judge0.conf
nano judge0.conf   # set real POSTGRES_PASSWORD, REDIS_PASSWORD, and AUTHN_TOKEN (see below)

docker compose up -d db redis
sleep 10
docker compose up -d
```

Give it a minute, then confirm it's alive (from the instance itself, over
localhost, regardless of what the security group allows in from outside):

```bash
curl http://localhost:2358/languages
```

You should get back a JSON array of supported languages. If it's empty or
errors, check `docker compose logs server`.

### If every submission comes back "Internal Error"

Symptom: `curl -X POST .../submissions?wait=true ...` returns
`{"status":{"id":13,"description":"Internal Error"}, "message":"No such
file or directory @ rb_sysopen - /box/script.py"}` regardless of what code
you send. This is Judge0's sandbox (`isolate`) failing against a kernel
booted with **cgroups v2 only** — the default on Ubuntu 22.04/24.04. Fix
by forcing the legacy cgroups v1 hierarchy:

```bash
sudo nano /etc/default/grub
# set: GRUB_CMDLINE_LINUX_DEFAULT="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
```

Reconnect after the reboot (`ssh ...` again), then confirm:

```bash
cat /sys/fs/cgroup/cgroup.controllers 2>/dev/null && echo "still v2 — fix didn't take" || echo "v1 legacy — good"
cd ~/judge0 && docker compose ps   # containers should already be back up (restart: always)
```

Then retest the `/submissions` curl above — `stdout` should now show the
real program output instead of an internal error.

## 4. Lock it down — read this before opening 2358 to the internet

Judge0 has **no authentication by default**. Because this backend runs on
Render, and Render's outbound IP is **not static on the free/starter
plan** (it changes, so you can't reliably lock the security group down to
"just Render's IP" without paying for Render's static-outbound-IP add-on),
the practical choice here is:

**Set `AUTHN_TOKEN` in `judge0.conf`** to a long random value, restart
(`docker compose up -d`), and put the same value in the backend's
`JUDGE0_AUTH_TOKEN` env var (below). Then it's safe to open port 2358 to
0.0.0.0/0 in the security group — anyone who hits it without the token
gets rejected. Generate a token with:

```bash
openssl rand -hex 32
```

If you later add Render's static-outbound-IP add-on, you can additionally
restrict the security group's 2358 rule to just that IP for defense in
depth — but the token alone is sufficient to not be "free code execution
for anyone who finds the port."

## 5. Point the backend at it

In `backend/.env` (and in Render's environment variables for production):

```
JUDGE0_URL=http://<your-elastic-ip>:2358
JUDGE0_AUTH_TOKEN=<the same value as AUTHN_TOKEN in judge0.conf>
```

Restart the backend. That's the only wiring needed — `JudgeService`
(`backend/src/judge/judge.service.ts`) reads these two env vars.

Verify from your own machine (not the EC2 instance) that the token is
actually being enforced:

```bash
curl http://<your-elastic-ip>:2358/languages
# should be rejected without a token

curl http://<your-elastic-ip>:2358/languages -H "X-Auth-Token: <token>"
# should return the language list
```

## Sizing note

Each concurrent code submission spins up a sandboxed process on this
instance. For a real placement-test event with many students submitting
code around the same time, size this the same way you'd think about the
Render backend capacity conversation — `t3.small` will queue up under real
concurrency, not fail outright (Judge0 queues via Redis), but submissions
will take longer to come back the more of them arrive at once. Bump to
`t3.medium`/`t3.large` before a real event if you expect a big burst, and
remember to stop the instance when you're not running a test so your
credits last.
