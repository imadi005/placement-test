# Placement Test Portal — Frontend Scaffold

Next.js (App Router) + TypeScript + Tailwind, built from scratch on the
**Academic Precision** design system (terracotta / cream / charcoal, Literata
+ Inter) generated in Stitch, matching `system-design/placement-test-platform-design.md`.

## Setup

```bash
npm install
npm run dev
```

## Structure

```
app/
  login/page.tsx          — student login
  dashboard/page.tsx       — student dashboard (upcoming test, scores)
  test/[testId]/page.tsx   — live test screen: timer, anti-cheat listeners, MCQ nav
components/
  ui/                      — design-system primitives (Button, Card, Badge, StatCard, ProgressRing)
  dashboard/               — dashboard-specific composites
  test/                    — test-taking composites (header, question card)
tailwind.config.ts         — single source of truth for every color/type/spacing token
```

Every color and type value in the app should trace back to `tailwind.config.ts`
— no hardcoded hex codes in components. If a new tone is needed, add it there
first.

## What's real vs. placeholder right now

- **Login is wired to the real backend** (`app/login/page.tsx` calls `POST /auth/login`)
- **Student dashboard is wired to the real backend** (`app/dashboard/page.tsx`) — real name via `GET /users/me`, real upcoming test via `GET /tests`, real score history via `GET /students/me/attempts`. No more hardcoded "Alexander"/placeholder rows.
- The live test screen wires up the **real browser-level anti-cheat hooks**
  (Page Visibility API for tab-switch, Fullscreen API for exit detection) —
  these fire against local state only for now. Wire `reportViolation()` in
  `app/test/[testId]/page.tsx` to a Socket.io emit once the WebSocket gateway
  exists.
- The countdown timer is client-side display only, by design — the actual
  deadline must be enforced server-side (see `system-design/...md` §5). Don't
  let this client clock become the source of truth when the backend lands.

- **Coordinator live-monitoring screen** (`app/coordinator/live/[testId]/page.tsx`) — real Socket.io connection (`lib/socket.ts`), joins the test's room, listens for `test:event` (violation/join/submit/status-change), Start/Stop buttons call the gateway's `coordinator:test_control`. Violation-count badges follow the sage/gold/crimson thresholds from `LiveMonitoringTable.tsx`
- **Question review/upload screen** (`app/coordinator/tests/[testId]/questions/page.tsx`) — upload docx/pdf → parsed draft renders as editable cards, `parseWarning`s surfaced as gold badges, every field (question text, options, correct-answer toggle, model answer for descriptive) editable before commit — nothing reaches the DB until "Commit" is pressed
- **Admin dashboard** (`app/admin/page.tsx`) — read-only: batch distribution, full test list. No mutation controls anywhere on this screen, matching the RBAC matrix's "view-all except add questions/batch changes" for admin
- **Teacher calendar** (`app/teacher/calendar/page.tsx`) — weekly grid from `GET /class-assignments/me`
- **Results screen** (`app/results/[attemptId]/page.tsx`) — real fetch from `GET /attempts/:id/result`; shows the `pending_grading` state honestly (MCQ score visible immediately, final score withheld) rather than faking a complete number

## Not built yet (descriptive-answer grading queue UI)

Same component patterns apply — reuse `Card`, `Badge`, `StatCard`,
`ProgressRing` rather than introducing new visual language per screen. The
Stitch reference screens/HTML for these are in the original export if you
need the layout reference while building them out.

## Next steps

1. `npm install && npm run dev`, check `/login`, `/dashboard`, `/test/demo` render as expected
2. Build out coordinator live-monitoring + question bank screens using the same primitives
3. Wire NestJS backend, replace placeholder data with real fetches
4. Connect Socket.io client for live timer sync + violation reporting
