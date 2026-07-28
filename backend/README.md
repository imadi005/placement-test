# Placement Test Portal — Backend (NestJS)

Matches `system-design/placement-test-platform-design.md` §2, §3, §8, §11.

## Setup

```bash
npm install
cp .env.example .env         # then fill in a real Postgres URL + secrets
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

Server runs on `http://localhost:4000`.

## Test login credentials (from the seed script)

All accounts use password: `Password123!`

| Role | Login identifier |
|---|---|
| Student | roll no `25MCAB01` |
| Teacher | `teacher.test@kju.edu` |
| Coordinator | `coordinator.test@kju.edu` |
| Admin | `admin.test@kju.edu` |

Test with:
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"25MCAB01","password":"Password123!"}'
```
Returns an `accessToken` (use as `Authorization: Bearer <token>` on subsequent requests) and sets an httpOnly refresh-token cookie.

**Change these passwords or remove the seed script entirely before any real deployment** — it exists for local dev only.

## What's built

- **Auth**: login (roll no or email), JWT access (15min) + httpOnly refresh cookie (7d) with rotation, rate-limited (`@Throttle`, 5 attempts/min)
- **RBAC**: `RolesGuard` + `@Roles(...)` decorator — reusable on any controller, matches the permission matrix in the design doc
- **Batches module**: coordinator/admin-only upgrade/downgrade, fully audited (writes `batch_history` + `audit_log` in one transaction) — this is the real implementation of the batch A/B/C requirement
- **Prisma schema**: the complete ER model from the design doc — users, students, teachers, class assignments, tests, questions, attempts, answers, violations, attendance, batch history, audit log

## Not built yet

Tests/questions/attempts/violations/attendance controllers, the WebSocket gateway for live monitoring, and the question-ingestion (docx/pdf parsing) pipeline. The schema already supports all of it — next modules follow the same pattern as `batches/`.

## Security notes baked in

- Passwords hashed with bcrypt (cost 12)
- `ValidationPipe({ whitelist: true })` strips unknown body fields globally
- JWT strategy re-fetches the user from the DB on every request rather than trusting stale token claims
- Refresh token is httpOnly + sameSite=strict, scoped to `/auth/refresh` only
