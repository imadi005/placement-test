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

**Staff:**
| Role | Login | Notes |
|---|---|---|
| Coordinator | `priya.menon@kju.edu` | |
| Admin | `r.iyer@kju.edu` | |
| Teacher | `vimala@kju.edu` | Teaches Aptitude, MCA A, Tue 3:40-4:30pm |
| Teacher | `vinothina@kju.edu` | Teaches Programming Fundamentals, MCA B |

**Students — 315 REAL students**, extracted and cleaned from KJU's actual `I_YEAR_PG_Placement_Training_-_Batch_Wise.xlsx` (see `../sample-data/kju-real-data-extract.xlsx` for the cleaned extraction + a Notes sheet documenting two anomalies found in the source). Log in with any roll number, e.g. `25MCAA01` / `Password123!`.

Real academic sections (stored in `student.section`): MCA A (64), MCA B (63), MCA C (64), MCA D (45), MSc Data Science (63), MSc Computer Science (16).

**Two things in the seed are placeholders, not from the source file** — documented in `prisma/seed.ts`:
- `student.batch` (A/B/C, our platform's score-based performance batch) — the source spreadsheet has no scores, so this is assigned round-robin purely so batch-scoped tests and the upgrade/downgrade feature have something to demo against.
- Class assignments only cover MCA A / MCA B as a small honest sample — the source spreadsheet's weekly "training groups" mix every academic section together per slot, which doesn't map cleanly onto this schema's one-class-one-section model, so it wasn't force-fit.

The seed also creates **one live, ready-to-take test** — "Weekly Aptitude Test — Numbers & Logic" (placeholder batch A, 1 MCQ + 1 descriptive question, already approved).

Test with:
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"25MCAA01","password":"Password123!"}'
```
Returns an `accessToken` (use as `Authorization: Bearer <token>` on subsequent requests) and sets an httpOnly refresh-token cookie.

**Change these passwords or remove the seed script entirely before any real deployment** — it exists for local dev only.

## Sample quiz document for testing the upload pipeline

`../sample-data/weekly-aptitude-quiz.docx` — a 5-question set (4 MCQ + 1 descriptive) in the exact format `QuestionExtractionService` expects. Upload it via the coordinator's question-review screen (or `POST /tests/:testId/questions/parse-preview`) to see the parser in action. This exact file was used to validate the parser during development — including catching and fixing a real bug where a document's title/header line was getting misread as a bogus first question (now fixed: a leading non-numbered chunk is dropped as preamble, not surfaced as a fake question).

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
  - `GET /students/me/attempts` — a student's own attempt history, for their dashboard's score table
- **Redis service** — wraps ioredis with the exact key patterns from design doc §4 (`attempt:{id}:state`, `attempt:{id}:violations`, `test:{id}:active_students`, pub/sub channel per test) — this is the single place that knows those key shapes
- **WebSocket gateway** (`test.gateway.ts`) — Socket.io, JWT-authenticated per message (`WsJwtGuard`, same re-fetch-user trust model as the HTTP strategy). Rooms are `test:{testId}`; the gateway relays Redis pub/sub events to the room (coordinator's live-monitoring feed) and lets a coordinator start/stop a test over `coordinator:test_control`. It deliberately does NOT duplicate answer/violation persistence — that stays in `AttemptsService` via REST, the gateway is fan-out only
- **Teacher-classes module** — `GET /class-assignments/me` (teacher's own calendar), `GET /class-assignments` (coordinator/admin — which teacher takes which class), `POST /class-assignments` (coordinator/admin sets these up; a teacher never creates their own)
- **Batch distribution** (`GET /batches/distribution`) — small addition backing the admin dashboard
- **Prisma schema**: the complete ER model from the design doc — users, students, teachers, class assignments, tests, questions, attempts, answers, violations, batch history, audit log

## Not built yet

Descriptive-answer grading queue (backend endpoints + review UI).

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

## How this was validated

Prisma's native engine binaries download from `binaries.prisma.sh`, which isn't reachable from every sandboxed environment. If `npx prisma migrate dev` ever fails with a 403/checksum error on a locked-down network, that's what's happening — it'll work normally on a regular machine or CI runner with full internet access. `prisma/manual-init.sql` and `prisma/manual-seed.sql` are the raw-SQL equivalents of the schema and seed data (used to validate this schema end-to-end against a real local Postgres when Prisma's engine wasn't reachable) — they're a fallback, not the intended workflow. The normal path is always `npx prisma migrate dev` + `npm run prisma:seed`.

## Security notes baked in

- Passwords hashed with bcrypt (cost 12)
- `ValidationPipe({ whitelist: true })` strips unknown body fields globally
- JWT strategy re-fetches the user from the DB on every request rather than trusting stale token claims
- Refresh token is httpOnly + sameSite=strict, scoped to `/auth/refresh` only
