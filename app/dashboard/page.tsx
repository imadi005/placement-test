"use client";

import { useEffect, useState } from "react";
import { UpcomingTestCard } from "@/components/dashboard/UpcomingTestCard";
import { ScoreHistoryTable, ScoreRow } from "@/components/dashboard/ScoreHistoryTable";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Me {
  fullName: string;
}
interface TestSummary {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  durationMinutes: number;
}
interface Attempt {
  id: string;
  testId: string;
  status: string;
  mcqScore: string | null;
  finalScore: string | null;
  submittedAt: string | null;
  test: { title: string };
}
export default function DashboardPage() {
  const ready = useAuthGuard(["student"]);
  const [me, setMe] = useState<Me | null>(null);
  const [upcomingTests, setUpcomingTests] = useState<TestSummary[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    async function load() {
      try {
        const [meRes, testsRes, attemptsRes] = await Promise.all([
          authFetch(`${API_URL}/users/me`),
          authFetch(`${API_URL}/tests`),
          authFetch(`${API_URL}/students/me/attempts`),
        ]);

        if (meRes.ok) setMe(await meRes.json());

        const attempts: Attempt[] = attemptsRes.ok ? await attemptsRes.json() : [];
        if (attemptsRes.ok) setAttempts(attempts);

        if (testsRes.ok) {
          const tests: TestSummary[] = await testsRes.json();
          // A test the student has already submitted/finished shouldn't be
          // offered as "upcoming" again — only an in-progress (resumable)
          // or never-attempted test counts.
          const finishedTestIds = new Set(
            attempts.filter((a) => a.status !== "in_progress").map((a) => a.testId)
          );
          // Every live/scheduled test the student is still eligible for —
          // not just the first one. A student can legitimately have more
          // than one test open at once (different coordinators, overlapping
          // schedules), and all of them need to be reachable, not just
          // whichever happened to come back first in the list.
          const next = tests
            .filter((t) => (t.status === "live" || t.status === "scheduled") && !finishedTestIds.has(t.id))
            .sort((a, b) => {
              // Live tests first (most urgent), then soonest-scheduled.
              if (a.status !== b.status) return a.status === "live" ? -1 : 1;
              const aTime = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
              const bTime = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
              return aTime - bTime;
            });
          setUpcomingTests(next);
        }
      } catch {
        setError("Couldn't reach the server. Is the backend running?");
      }
    }
    load();
    // A coordinator can start a test at any moment while a student is
    // sitting on this page — poll so "Live now" appears without the
    // student having to manually refresh.
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [ready]);

  if (!ready) return null;

  const firstName = me?.fullName?.split(" ")[0] ?? "";

  const scoreRows: ScoreRow[] = attempts.map((a) => ({
    attemptId: a.id,
    testName: a.test.title,
    dateCompleted: a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : "—",
    score: a.finalScore ?? a.mcqScore ?? "—",
    status: "graded",
  }));

  return (
    <main className="mx-auto max-w-container animate-fade-in-up px-4 py-8 md:px-gutter">
      <header className="mb-8">
        <h1 className="font-serif text-display-lg-mobile text-on-surface md:text-display-lg">
          {me ? `Hello, ${firstName}.` : "Hello."}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {upcomingTests.length > 0
            ? `Welcome back. You have ${upcomingTests.length} upcoming assessment${upcomingTests.length === 1 ? "" : "s"}.`
            : "Welcome back."}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      {upcomingTests.length > 0 && (
        <section className="mb-10 flex flex-col gap-4">
          {upcomingTests.map((test) => (
            <UpcomingTestCard
              key={test.id}
              testId={test.id}
              title={test.title}
              description={
                test.status === "live"
                  ? "This test is live now — you can start it immediately."
                  : "Ensure your environment is set up 15 minutes prior."
              }
              date={test.scheduledStart ? new Date(test.scheduledStart).toLocaleString() : "TBD"}
              durationLabel={`${test.durationMinutes} min`}
              isLive={test.status === "live"}
              hoursUntilStart={
                test.scheduledStart
                  ? Math.max(0, Math.round((new Date(test.scheduledStart).getTime() - Date.now()) / 3600000))
                  : 0
              }
            />
          ))}
        </section>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-headline-md text-on-surface">Assessment performance</h2>
        </div>
        {scoreRows.length > 0 ? (
          <ScoreHistoryTable rows={scoreRows} />
        ) : (
          <p className="text-body-sm text-on-surface-variant">No tests taken yet.</p>
        )}
      </section>
    </main>
  );
}
