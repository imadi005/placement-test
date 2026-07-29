"use client";

import { useEffect, useState } from "react";
import { UpcomingTestCard } from "@/components/dashboard/UpcomingTestCard";
import { ScoreHistoryTable, ScoreRow } from "@/components/dashboard/ScoreHistoryTable";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

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
  const [upcomingTest, setUpcomingTest] = useState<TestSummary | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    async function load() {
      try {
        const [meRes, testsRes, attemptsRes] = await Promise.all([
          fetch(`${API_URL}/users/me`, { headers: authHeaders() }),
          fetch(`${API_URL}/tests`, { headers: authHeaders() }),
          fetch(`${API_URL}/students/me/attempts`, { headers: authHeaders() }),
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
          const next = tests.find(
            (t) => (t.status === "live" || t.status === "scheduled") && !finishedTestIds.has(t.id)
          );
          setUpcomingTest(next ?? null);
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
    score:
      a.status === "pending_grading"
        ? "—"
        : a.finalScore ?? a.mcqScore ?? "—",
    status: a.status === "pending_grading" ? "pending_grading" : "graded",
  }));

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-8">
        <h1 className="font-serif text-display-lg-mobile text-on-surface md:text-display-lg">
          {me ? `Hello, ${firstName}.` : "Hello."}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {upcomingTest ? "Welcome back. You have one upcoming assessment." : "Welcome back."}
        </p>
      </header>

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      {upcomingTest && (
        <section className="mb-10">
          <UpcomingTestCard
            testId={upcomingTest.id}
            title={upcomingTest.title}
            description={
              upcomingTest.status === "live"
                ? "This test is live now — you can start it immediately."
                : "Ensure your environment is set up 15 minutes prior."
            }
            date={
              upcomingTest.scheduledStart
                ? new Date(upcomingTest.scheduledStart).toLocaleString()
                : "TBD"
            }
            durationLabel={`${upcomingTest.durationMinutes} min`}
            isLive={upcomingTest.status === "live"}
            hoursUntilStart={
              upcomingTest.scheduledStart
                ? Math.max(0, Math.round((new Date(upcomingTest.scheduledStart).getTime() - Date.now()) / 3600000))
                : 0
            }
          />
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
