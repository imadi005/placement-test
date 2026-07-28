# Placement Test Portal — Backend (NestJS)

Matches `system-design/placement-test-platform-design.md` §2, §3, §8, §11.

## Setup

```bash
npm install
cp .env.example .env         # then fill in a real Postgres URL, Redis URL + secrets
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

Needs a running Postgres **and Redis** instance (`REDIS_URL` in `.env` — `redis://localhost:6379` for local dev, or a free tier on Upstash for cloud).

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
- **Tests module**: create (coordinator), batch-scoped visibility for students, lifecycle (`draft → scheduled → live → ended`) — `schedule()` refuses to move forward until the question set is reviewed and approved
- **Questions module** — the docx/pdf ingestion pipeline (design doc §10):
  - `POST /tests/:testId/questions/parse-preview` — upload a .docx/.pdf, get back parsed draft questions (mammoth for docx, pdf-parse for pdf, then a heuristic regex extractor looking for `1. question / A) option / Answer: B` patterns). **Nothing is saved here** — preview only
  - `POST /tests/:testId/questions/commit` — the coordinator's reviewed/edited final set gets persisted here; committing resets the test's `approved` flag so a re-upload always needs re-review
  - Manual `POST`/`PUT`/`DELETE` on individual questions for hand-editing after parse
  - Every draft question carries a `parseWarning` when the heuristic couldn't confidently find options or a marked answer — surface these prominently in the review UI, don't let a warned question slip through silently
- **Attempts module — the live test-taking engine** (design doc §5):
  - `POST /tests/:testId/attempts/start` — creates (or resumes) the attempt, adds the student to Redis's active-set for the test, strips `isCorrect` off options before returning questions to the client
  - `POST /attempts/:id/answers` — autosave, upserts on `(attemptId, questionId)` so repeated saves never duplicate
  - `POST /attempts/:id/violations` — persists every violation (audit trail), increments a Redis counter, auto-submits once the threshold (5) is crossed — the "violation scoring" approach from §7, not a guarantee
  - `POST /attempts/:id/submit` — scores MCQ answers instantly; if the test has any non-MCQ questions the attempt goes to `pending_grading` instead of `graded` (§10a)
- **Redis service** — wraps ioredis with the exact key patterns from design doc §4 (`attempt:{id}:state`, `attempt:{id}:violations`, `test:{id}:active_students`, pub/sub channel per test) — this is the single place that knows those key shapes
- **WebSocket gateway** (`test.gateway.ts`) — Socket.io, JWT-authenticated per message (`WsJwtGuard`, same re-fetch-user trust model as the HTTP strategy). Rooms are `test:{testId}`; the gateway relays Redis pub/sub events to the room (coordinator's live-monitoring feed) and lets a coordinator start/stop a test over `coordinator:test_control`. It deliberately does NOT duplicate answer/violation persistence — that stays in `AttemptsService` via REST, the gateway is fan-out only
- **Teacher-classes module** — `GET /class-assignments/me` (teacher's own calendar), `GET /class-assignments` (coordinator/admin — which teacher takes which class), `POST /class-assignments` (coordinator/admin sets these up; a teacher never creates their own)
- **Attendance module**:
  - `POST /class-assignments/:id/attendance` — teacher marks attendance for a date; ownership is enforced server-side (`assertOwnedByTeacher` — a teacher can never mark a class assigned to someone else, regardless of what the request body claims)
  - `GET /class-assignments/:id/attendance?date=` — teacher pulls up a date's marks to edit
  - `GET /students/me/attendance` — student's own dashboard widget: per-class % + overall (excused absences don't count against the denominator)
  - `GET /students/:studentId/attendance` — coordinator/admin looking up any student
  - `GET /attendance/summary` — coordinator/admin view: attendance % per class alongside which teacher takes it
- **Prisma schema**: the complete ER model from the design doc — users, students, teachers, class assignments, tests, questions, attempts, answers, violations, attendance, batch history, audit log

## Not built yet

Coordinator/admin frontend screens, descriptive-answer grading queue UI. The schema and REST patterns already support all of it.

## Connecting from the frontend to the gateway

```js
import { io } from "socket.io-client";
const socket = io(API_URL, { auth: { token: accessToken } });
socket.emit("test:join", { testId });
socket.on("test:event", (event) => { /* violation, join, submit, status-change events */ });
```

## Question parser — current limitation

The extractor is a **regex heuristic**, not an LLM — it expects teachers'
docx/pdf files to roughly follow a `1. question text / A) option / B) option
/ Answer: B` layout. Messier formats (multi-paragraph questions, tables,
inconsistent numbering) will parse partially or get flagged with
`parseWarning`. This is intentional as a fast, dependency-light first pass;
an optional LLM-assisted structuring pass (as noted in the design doc §10)
can be added later as a second parsing strategy the coordinator can pick
when the heuristic struggles — swap it into `QuestionExtractionService`
without touching the controller or commit flow.

## Security notes baked in

- Passwords hashed with bcrypt (cost 12)
- `ValidationPipe({ whitelist: true })` strips unknown body fields globally
- JWT strategy re-fetches the user from the DB on every request rather than trusting stale token claims
- Refresh token is httpOnly + sameSite=strict, scoped to `/auth/refresh` only
