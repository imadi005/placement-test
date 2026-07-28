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
  dashboard/page.tsx       — student dashboard (upcoming test, scores, attendance)
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

- **Login is now wired to the real backend** (`app/login/page.tsx` calls `POST /auth/login` on the NestJS API, see `../backend/README.md` for test credentials and setup)
- Dashboard and test pages still render with **hardcoded placeholder data** — swap for real fetches once the corresponding NestJS modules exist (only `auth`, `users/me`, and `batches` are built so far)
- The live test screen wires up the **real browser-level anti-cheat hooks**
  (Page Visibility API for tab-switch, Fullscreen API for exit detection) —
  these fire against local state only for now. Wire `reportViolation()` in
  `app/test/[testId]/page.tsx` to a Socket.io emit once the WebSocket gateway
  exists.
- The countdown timer is client-side display only, by design — the actual
  deadline must be enforced server-side (see `system-design/...md` §5). Don't
  let this client clock become the source of truth when the backend lands.

## Not built yet (coordinator, admin, teacher, results, question bank screens)

Same component patterns apply — reuse `Card`, `Badge`, `StatCard`,
`ProgressRing` rather than introducing new visual language per screen. The
Stitch reference screens/HTML for these are in the original export if you
need the layout reference while building them out.

## Next steps

1. `npm install && npm run dev`, check `/login`, `/dashboard`, `/test/demo` render as expected
2. Build out coordinator live-monitoring + question bank screens using the same primitives
3. Wire NestJS backend, replace placeholder data with real fetches
4. Connect Socket.io client for live timer sync + violation reporting
