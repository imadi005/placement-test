# Handoff — Placement Test Portal

Everything a fresh session (Claude Code or otherwise) needs to pick this project up with zero prior context.

## Repo

**https://github.com/imadi005/placement-test** (branch: `main`)

Local path (Aditya's machine): `C:\Users\Asus\placement-test-portal\placement-test-portal`

GitHub Personal Access Token: **not stored here** — this file is committed to the repo itself, and a token doesn't belong in version control (GitHub's secret-scanning rightly blocks pushes containing one). Ask Aditya directly for the current token if a push needs it; if it's ever needed again, keep it out of any committed file and only pass it inline in a shell command, the same way it's been handled all along this session.

## What this is

A weekly placement-test web app for KJU (Kristu Jayanti University) — **not** related to the pre-existing `kju-placement-portal` project (that one's for marksheet verification/ATS/interview pipelines). Handles 1200 concurrent students, 3 roles (student/coordinator/admin), live proctoring signals, batch (A/B/C) management.

The teacher role and attendance tracking were both deliberately removed (2026-07-29) — attendance had no real functionality without a teacher-facing marking screen, and once that went, the teacher role itself had nothing left to do. Only student/coordinator/admin remain.

Full requirements + architecture: `system-design/placement-test-platform-design.md` in the repo (schema, Redis key patterns, WebSocket events, RBAC matrix, anti-cheat honesty table, everything).

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind, design tokens from a Stitch-generated "Academic Precision" system (terracotta/cream/charcoal, Literata+Inter serif/sans pairing) — see `tailwind.config.ts`
- **Backend**: NestJS + Prisma + PostgreSQL (hosted on **Neon**) + Redis (hosted on **Upstash**) + Socket.io
- **Hosting plan** (not yet deployed anywhere): Vercel (frontend) + Render/Railway (backend+WS) — currently only running locally for dev/demo

## Repo structure

```
/                          — Next.js frontend
  app/                     — pages: login, dashboard, test/[id], results/[id],
                             coordinator (+live/[id], +tests/[id]/questions), admin
  components/              — AppHeader.tsx (shared nav + logout), ui/
                             (design-system primitives), dashboard/,
                             coordinator/, questions/
  lib/socket.ts            — shared Socket.io client
backend/
  src/
    auth/, users/, batches/, tests/, questions/, attempts/,
    redis/, gateway/, prisma/
  prisma/
    schema.prisma          — full ER model
    seed.ts                — REAL seed data (see below)
    data/students-real.json — the 315 real students, loaded by seed.ts
    manual-init.sql / manual-seed.sql — raw-SQL fallback used only to
      validate the schema in a sandboxed dev environment; not the normal path
sample-data/
  weekly-aptitude-quiz.docx     — sample quiz for testing the upload pipeline
  kju-real-data-extract.xlsx   — cleaned roster+schedule extraction, with a Notes sheet
```

Both `README.md` (root, frontend) and `backend/README.md` have detailed setup + module-by-module notes — read those for anything not covered here.

## Environment

`backend/.env` already exists locally with real values (Neon Postgres + Upstash Redis + JWT secrets) — **do not need to recreate it**, just don't commit it (already gitignored). If it's ever missing, `backend/.env.example` has the template; ask Aditya for the actual Neon/Upstash values rather than inventing placeholders.

Setup from scratch:
```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev        # localhost:4000

cd ..
npm install
npm run dev              # localhost:3000
```

## Demo/test logins

Password for **every** account: `Password123!`

| Role | Login |
|---|---|
| Student (Batch A, MCA A) | roll `25MCAA01` |
| Coordinator | `priya.menon@kju.edu` |
| Admin | `r.iyer@kju.edu` |

315 real students seeded across 6 real academic sections (MCA A/B/C/D, MSc Data Science, MSc Computer Science) — extracted from KJU's actual placement-training schedule spreadsheet. `student.batch` (A/B/C, the score-based performance batch) is a round-robin **placeholder** — the source data has no scores. One live test ("Weekly Aptitude Test — Numbers & Logic") is pre-seeded and ready to take immediately as a Batch-A student.

## What's built (in order)

1. System design doc, Next.js scaffold with design tokens, login/dashboard/live-test-screen UI
2. NestJS backend: auth (JWT + roll-no-or-email login + roles), batches (audited upgrade/downgrade)
3. Tests + Questions modules: lifecycle (draft→scheduled→live→ended), docx/pdf ingestion (mammoth/pdf-parse + heuristic regex parser), parse-preview/commit review flow
4. Attempts module + Redis + WebSocket gateway: start/answer/violation/submit, auto-submit at 5 violations, live coordinator feed
5. Coordinator live-monitoring screen, admin dashboard, results screen — all wired to real data
6. Real 315-student roster seeded (replacing earlier small demo set)
7. **UX overhaul of the coordinator flow**: single modal for test creation (details → upload/confirm questions → Start now/Schedule), no separate confusing "Approve" step, clean ticking status badges
8. Attendance module + teacher role removed entirely (2026-07-29) — attendance had no marking UI worth keeping, and without it the teacher role had no remaining function
9. **UX audit pass** (2026-07-29): shared `AppHeader` with logout added (previously no way to log out at all); descriptive/non-MCQ questions could not actually be answered on the live test screen (no free-text input existed — fixed); per-question MCQ scores on the results breakdown always showed 0 regardless of correctness (only the aggregate was ever written — fixed); resuming an attempt (refresh/reconnect) lost all visible answers even though they were saved server-side (fixed); the live countdown always used a hardcoded 40min instead of the test's actual configured duration (fixed); `tests.start()` had no gate, so "Start now" on a draft test closed out before questions were committed silently went live with zero questions (fixed, now matches `schedule()`'s gate); dead "Download guidelines" button and dead "Forgot password?" link removed; manually-added questions could only ever be MCQ (no type selector existed) — fixed

## Known bugs found + fixed during testing (context for why some code looks the way it does)

- **Login redirect** used to always send everyone to `/dashboard` regardless of role — now role-routes (student→dashboard, coordinator→/coordinator, admin→/admin)
- **Question commit** threw 500s via Prisma's 5s interactive-transaction timeout (sequential per-question `create()` over Neon's pooler was too slow) — switched to bulk `createMany` + explicit 15s timeout on all transactions
- **Student dashboard** was showing hardcoded placeholder data ("Alexander") — now fetches real `/users/me`, `/tests`, `/students/me/attempts`
- **Scheduled tests never auto-started** — added `TestSchedulerService` (polls every 15s, flips `scheduled`→`live` once `scheduledStart` passes)
- **Dashboard/coordinator list didn't reflect live changes** without a manual refresh — both now poll every 5s
- **Test-start crashed on a unique-constraint race** — React dev-mode double-invokes effects, causing duplicate `POST /attempts/start` calls; the second used to crash with an unhandled Prisma error. Now catches the race and resumes gracefully instead of crashing.
- Frontend error messages used to show the same generic text regardless of actual cause — several spots now surface the real backend error message

## What's NOT built yet

- Descriptive-answer grading queue (backend endpoints + review UI) — schema already supports it (`ai_suggested_marks`, `marks_awarded`, `graded_by` on `attempt_answers`), just no UI/endpoint to actually grade
- Native Android wrapper for FLAG_SECURE screenshot blocking (deprioritized — majority of students are on iOS, where this doesn't apply anyway)
- Actual deployment to Vercel/Render — everything currently runs locally only

## Design/product decisions worth knowing

- Anti-cheat is explicitly framed as "violation scoring" (tab-switch + fullscreen-exit detection, which are real and enforceable), not true prevention — OS-level screenshot/Circle-to-Search/screen-share blocking is a documented non-goal for iOS/desktop (no browser API for it), Android could get `FLAG_SECURE` via a native wrapper but that's deprioritized given iOS-majority userbase
- MCQ scores instantly; any test with a descriptive question goes to `pending_grading` status instead of `graded` until a human reviews it — this was a deliberate choice to keep the "instant results" promise honest
- Batch upgrade/downgrade is always audit-trailed (`batch_history` + `audit_log`), never a silent field update
