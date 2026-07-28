# KJU Placement Test Platform — System Design

**Stack:** NestJS (Node/TS) · Next.js (App Router) · PostgreSQL (Supabase/Neon) · Redis · Socket.io
**Hosting:** Next.js → Vercel · NestJS + WebSocket gateway → Render/Railway · Postgres → Supabase/Neon · Redis → Upstash/Render Redis
**Scale target:** 1200 concurrent students per test window

---

## 1. Goals & Non-Goals

**Goals**
- Weekly timed placement tests, objective (MCQ-style) scoring, instant results
- 4 roles: Student, Teacher, Placement Coordinator, Admin — each with a distinct permission surface
- Live proctoring signals (tab switch, fullscreen exit, violation count) with auto-cutoff
- Batch (A/B/C) management with full audit trail
- Attendance tracking tied to teacher-led placement classes
- Built to keep growing — every module is additive, not a rewrite

**Non-Goals (be upfront about these with the placement office)**
- Preventing a second device from photographing the screen — no software fix for this
- OS-level screenshot/Circle-to-Search/screen-share blocking **inside a plain browser tab** — solved instead via a native Android wrapper, see §7a
- Fully automatic, review-free grading of descriptive answers — LLM can suggest, a human always finalizes

---

## 2. High-Level Architecture

```
┌─────────────────┐        ┌──────────────────────────┐        ┌─────────────────┐
│  Next.js (Vercel)│───────▶│  NestJS API (Render)      │───────▶│ PostgreSQL       │
│  - Student UI    │  HTTPS │  - Auth/RBAC guards       │  SQL   │ (Supabase/Neon)  │
│  - Teacher UI    │        │  - REST controllers       │        │ - source of truth│
│  - Coordinator UI│        │  - Question ingestion     │        └─────────────────┘
│  - Admin UI      │        │  - Scoring engine         │
└─────────────────┘        │  - WebSocket Gateway      │        ┌─────────────────┐
        ▲                   └──────────┬───────────────┘───────▶│ Redis (Upstash)  │
        │ WSS (Socket.io)              │                        │ - live session   │
        └───────────────────────────────┘                        │   state/timers   │
                                                                   │ - violation ctr  │
                                                                   │ - pub/sub for    │
                                                                   │   coordinator    │
                                                                   │   live feed      │
                                                                   └─────────────────┘
```

**Why this split:** Vercel is great for the Next.js frontend (edge caching, fast deploys) but doesn't hold persistent WebSocket connections well — the exam engine needs those for live tab-switch events and the coordinator's live monitoring feed, so that piece lives on Render/Railway as a long-running Node process. Redis sits between NestJS and Postgres so that per-second things (timer ticks, violation counts, "which question is student X on") never hit Postgres directly — only meaningful state changes (submit, violation threshold breach, test end) get persisted.

---

## 3. Database Schema (PostgreSQL)

### Core identity & roles
```sql
users (
  id UUID PK,
  email TEXT UNIQUE,
  password_hash TEXT,
  role ENUM('student','teacher','coordinator','admin'),
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
)

students (
  user_id UUID PK REFERENCES users(id),
  roll_no TEXT UNIQUE,
  batch ENUM('A','B','C'),
  section TEXT,
  current_semester INT
)

teachers (
  user_id UUID PK REFERENCES users(id),
  department TEXT
)

teacher_class_assignments (
  id UUID PK,
  teacher_id UUID REFERENCES teachers(user_id),
  section TEXT,
  subject TEXT,
  day_of_week INT,
  start_time TIME,
  end_time TIME
)
```

### Batch management (audited)
```sql
batch_history (
  id UUID PK,
  student_id UUID REFERENCES students(user_id),
  old_batch ENUM('A','B','C'),
  new_batch ENUM('A','B','C'),
  changed_by UUID REFERENCES users(id),   -- coordinator or admin
  reason TEXT,                             -- e.g. "Test #42 score 91%"
  related_test_id UUID NULL REFERENCES tests(id),
  changed_at TIMESTAMPTZ DEFAULT now()
)
```
Never update `students.batch` directly from a UI action — always insert into `batch_history` first, then update the denormalized `students.batch` field in the same transaction. This gives you a full timeline per student for free.

### Tests & questions
```sql
tests (
  id UUID PK,
  title TEXT,
  batch_scope ENUM('A','B','C','ALL'),
  duration_minutes INT,
  scheduled_start TIMESTAMPTZ,
  status ENUM('draft','scheduled','live','ended'),
  created_by UUID REFERENCES users(id),    -- coordinator
  source_file_url TEXT,                    -- original docx/pdf, for audit
  approved BOOLEAN DEFAULT false           -- human review gate before 'scheduled'
)

questions (
  id UUID PK,
  test_id UUID REFERENCES tests(id),
  question_text TEXT,
  question_order INT,
  marks NUMERIC DEFAULT 1,
  question_type ENUM('mcq','short_answer','numeric','descriptive') DEFAULT 'mcq',
  model_answer TEXT NULL,      -- expected answer / rubric, for non-mcq types
  rubric_notes TEXT NULL       -- grading guidance for the reviewer
)

question_options (
  id UUID PK,
  question_id UUID REFERENCES questions(id),
  option_text TEXT,
  is_correct BOOLEAN
)
```

### Attempts, answers, violations
```sql
test_attempts (
  id UUID PK,
  test_id UUID REFERENCES tests(id),
  student_id UUID REFERENCES students(user_id),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status ENUM('in_progress','submitted','auto_submitted','flagged','pending_grading','graded'),
  mcq_score NUMERIC,           -- computed instantly at submit
  final_score NUMERIC NULL,    -- locked once descriptive portion (if any) is graded
  UNIQUE(test_id, student_id)
)

attempt_answers (
  id UUID PK,
  attempt_id UUID REFERENCES test_attempts(id),
  question_id UUID REFERENCES questions(id),
  selected_option_id UUID REFERENCES question_options(id),  -- for mcq
  free_text_answer TEXT NULL,      -- for short_answer/numeric/descriptive
  ai_suggested_marks NUMERIC NULL, -- optional LLM-assisted first pass
  marks_awarded NUMERIC NULL,      -- final, set by human reviewer
  graded_by UUID NULL REFERENCES users(id),
  graded_at TIMESTAMPTZ NULL,
  answered_at TIMESTAMPTZ
)

violations (
  id UUID PK,
  attempt_id UUID REFERENCES test_attempts(id),
  type ENUM('tab_switch','fullscreen_exit','devtools_suspected','copy_paste','window_blur'),
  occurred_at TIMESTAMPTZ,
  meta JSONB    -- e.g. duration away, count at time of event
)
```

### Attendance
```sql
attendance (
  id UUID PK,
  student_id UUID REFERENCES students(user_id),
  class_assignment_id UUID REFERENCES teacher_class_assignments(id),
  date DATE,
  status ENUM('present','absent','excused'),
  marked_by UUID REFERENCES users(id),   -- teacher
  UNIQUE(student_id, class_assignment_id, date)
)
```

---

## 4. Redis Usage

| Key pattern | Purpose | TTL |
|---|---|---|
| `attempt:{attemptId}:state` | current question index, time remaining, last-seen timestamp | test duration + buffer |
| `attempt:{attemptId}:violations` | live violation counter (synced to Postgres on threshold/submit) | test duration + buffer |
| `test:{testId}:active_students` | Set of student IDs currently in the test — powers coordinator's live view | test duration + buffer |
| `channel:test:{testId}:events` | Pub/Sub channel — violation events, submissions, joins — coordinator dashboard subscribes here | — |

Redis is the "hot path" during the test window; everything gets flushed to Postgres on submit/auto-submit/test-end so Redis can be treated as disposable cache, not source of truth.

---

## 5. Test Engine — State Machine

```
draft → scheduled → live → ended
```
- **draft**: coordinator building/uploading questions
- **scheduled**: approved, waiting for start time — visible to students as "upcoming"
- **live**: coordinator hits Start (or auto-starts at `scheduled_start`) — creates `test_attempts` rows lazily as each student joins, starts Redis timer per attempt
- **ended**: coordinator hits Stop, or all attempts submitted/auto-submitted, or global duration elapsed — triggers final scoring pass, results become visible to students

**Per-student attempt flow:**
1. Student hits "Start Test" → attempt row created, Redis state initialized, fullscreen forced client-side
2. Server-authoritative timer — client shows a countdown but server decides when time's up (never trust client clock)
3. Answers autosaved to Redis every ~5s and on every selection, batched to Postgres every ~20-30s or on question navigation
4. On submit (manual or timeout or violation-triggered) → score computed server-side instantly (objective questions = deterministic), `test_attempts.status` updated, result pushed to student immediately

---

## 6. WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `test:join` | client→server | `{testId, studentId}` |
| `test:violation` | client→server | `{attemptId, type, meta}` |
| `test:tick` | server→client | `{timeRemaining}` (every 5-10s, not every second — reduces load) |
| `test:auto_submit` | server→client | `{reason}` |
| `coordinator:live_feed` | server→coordinator | `{studentId, currentQuestion, violationCount, status}` on any change |
| `coordinator:test_control` | coordinator→server | `{action: 'start'|'stop', testId}` |

Coordinator's live-monitoring screen is just a subscriber to `channel:test:{testId}:events` — no polling.

---

## 7. Anti-Cheat — What's Real vs. What to Communicate as a Limitation

| Signal | Detectable? | Mechanism |
|---|---|---|
| Tab switch / window blur | ✅ Reliable | Page Visibility API + blur/focus listeners |
| Fullscreen exit | ✅ Reliable | Fullscreen API + `fullscreenchange` event, force re-entry or flag |
| Copy/paste, right-click | ⚠️ Deterrent only | Can intercept in JS, but not unbeatable |
| DevTools open | ⚠️ Heuristic only | Window size/debugger-timing tricks — false positives possible |
| OS screenshot (Snipping Tool, PrintScreen) | ❌ Not detectable | No browser API surface for this |
| "Circle to search" / OS gestures | ❌ Not detectable | OS-level, no web API exposes this |
| Second device photographing screen | ❌ Not detectable | No software fix — physical proctoring only |

**Recommendation to the placement office:** frame this as a "violation scoring" system (auto-cutoff on tab-switch/fullscreen violations, which are real and enforceable) rather than promising total lockdown. For genuinely high-stakes rounds, pair with in-person invigilation or a native lockdown browser (e.g. Safe Exam Browser) as a phase-2 addition — don't over-commit the web app to something browsers can't do.

### 7a. The real fix for screenshot / Circle to Search / AI screen-share

A plain browser tab cannot block these — no permission exists for it on any browser, by design (a website being able to disable your OS screenshot function would be a serious security hole). But this is solvable outside the tab:

| Platform | Solution | What it actually blocks |
|---|---|---|
| **Android** | Wrap the web app in a native shell (Capacitor/Cordova) and set the `FLAG_SECURE` window flag | Screenshots, screen recording, casting, **and** makes the content invisible to Circle to Search / Gemini overlay / any screen-share — Android treats a `FLAG_SECURE` window as non-capturable system-wide, same mechanism Netflix/banking apps use |
| **iOS** | No equivalent "prevent" flag for arbitrary content. Can only *detect* via `UIApplicationUserDidTakeScreenshotNotification` and react (flag attempt, warn, auto-submit on repeat) | Detection only, not prevention |
| **Desktop (Win/Mac)** | Same tier as iOS — no browser-tab fix. True blocking needs a genuine native lockdown app (what Safe Exam Browser/Respondus actually are) hooking OS APIs to disable PrintScreen and kill screen-recording software | Phase-2 scope, separate installed app, not part of the Next.js web app |

**Practical plan:** since most students are likely on Android, build the native Android wrapper as its own module early — it's the one platform where you can get near-total lockdown with one flag, and it directly kills the three things flagged as most concerning (screenshot, Circle to Search, screen-share). iOS and desktop stay on the violation-scoring approach (tab-switch/fullscreen detection + coordinator live view + screenshot-detection-and-flag where available) until/unless a native lockdown app becomes phase-2 scope.

---

## 8. RBAC Summary

| Action | Student | Teacher | Coordinator | Admin |
|---|---|---|---|---|
| Take test | ✅ | ❌ | ❌ | ❌ |
| View own scores/attendance | ✅ | ❌ | ❌ | ❌ |
| View own calendar, mark attendance | ❌ | ✅ | ❌ | ❌ |
| Start/stop test, live monitor | ❌ | ❌ | ✅ | 👁 view-only |
| Add/edit question bank + answers | ❌ | ❌ | ✅ | ❌ |
| Batch upgrade/downgrade | ❌ | ❌ | ✅ | ✅ |
| View all students/teachers/records | ❌ | ❌ | section-wise | ✅ all |

Implement as NestJS Guards (`@Roles('coordinator')` decorator + a `RolesGuard`) rather than scattering `if (user.role === ...)` checks through controllers.

---

## 9. Suggested NestJS Module Structure

```
src/
  auth/                # JWT strategy, guards, login/refresh
  users/               # user CRUD, role assignment
  students/            # student profile, batch field
  batches/             # batch_history CRUD, upgrade/downgrade endpoints
  tests/                # test CRUD, scheduling, start/stop
  questions/           # question bank CRUD, docx/pdf ingestion
  attempts/            # attempt lifecycle, scoring
  violations/          # violation logging
  attendance/          # attendance CRUD
  teacher-classes/     # class assignments, calendar
  gateway/             # Socket.io gateway — test events + coordinator feed
  common/
    guards/
    decorators/
    redis/
```

---

## 10. Question Ingestion Pipeline

1. Coordinator uploads docx/pdf via UI
2. Backend parses: `mammoth` for docx → HTML/text, `pdf-parse`/`pdfplumber` for pdf
3. Optional: LLM-assisted structuring pass (question text, options, correct answer) into draft JSON
4. **Human review screen** — coordinator confirms/edits parsed questions before they attach to a test (never auto-publish parsed content directly into a live exam)
5. On approve → rows inserted into `questions`/`question_options`, test stays in `draft` until coordinator explicitly schedules it

---

## 10a. Descriptive/Short-Answer Grading Workflow

Most questions stay MCQ (instant scoring), but the schema supports non-MCQ from day one so it's not a bolt-on later:

1. On submit, MCQ answers are scored instantly (deterministic) → `test_attempts.mcq_score` set, attempt moves to `pending_grading` **only if** the test contains any non-MCQ questions; otherwise straight to `graded`
2. Student sees the MCQ-portion score immediately, with a "final score pending — X descriptive answers awaiting review" note
3. Optional: an LLM pass (Claude/Gemini) compares `free_text_answer` against `model_answer`/`rubric_notes` and writes `ai_suggested_marks` — this is a first-pass suggestion only, never auto-applied
4. Teacher or coordinator opens a **grading queue** (filterable by test/question/batch), sees student answer + model answer + AI suggestion side by side, sets `marks_awarded` — this is a manual, auditable action (`graded_by`, `graded_at`)
5. Once every non-MCQ answer in an attempt is graded, `final_score` is computed and `test_attempts.status` → `graded`, results become final for that student

This keeps the "instant results" promise honest for pure-MCQ tests while giving descriptive questions real scope without pretending they can be instant.

---

## 11. Security Checklist

- JWT access token (short-lived, ~15min) + refresh token (httpOnly cookie)
- Single active session per student during a live test — reject a second login attempt on the same test with a clear message, don't silently allow parallel sessions
- Rate limiting on auth endpoints (NestJS `@nestjs/throttler`)
- All batch changes, question edits, and test start/stop actions logged to an `audit_log` table (actor, action, target, timestamp)
- Postgres row-level checks or service-layer checks — never trust `role` from the JWT alone without re-verifying against DB on sensitive actions

---

## 12. Build Phases

**Phase 1 (MVP):** Auth + RBAC, question upload+review (MCQ only), single test flow (start→answer→submit→score), basic student dashboard
**Phase 2:** Anti-cheat (tab switch, fullscreen), coordinator live view, attendance module
**Phase 3:** Batch management + audit trail, admin views, teacher calendar
**Phase 4:** Descriptive/short-answer question types + grading queue (manual + AI-assisted suggestion)
**Phase 5:** Native Android wrapper (Capacitor) with `FLAG_SECURE` — kills screenshot/Circle to Search/screen-share on Android
**Phase 6:** Load testing (k6/Locust simulating 1200 concurrent joins), polish, analytics/reporting exports

---

## 13. Open Questions to Resolve Before Coding

- Question type scope for v1 — pure MCQ, or also numeric/short-answer with exact-match grading?
- Does a test ever span multiple batches with different question sets, or always one test = one batch?
- Retry policy — if a student's connection drops mid-test, do they resume the same attempt or is it auto-submitted?
