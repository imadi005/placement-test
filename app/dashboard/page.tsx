"use client";

import { useEffect, useState } from "react";
import { UpcomingTestCard } from "@/components/dashboard/UpcomingTestCard";
import { ScoreHistoryTable, ScoreRow } from "@/components/dashboard/ScoreHistoryTable";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StatCard } from "@/components/ui/StatCard";

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
  status: string;
  mcqScore: string | null;
  finalScore: string | null;
  submittedAt: string | null;
  test: { title: string };
}
interface AttendanceSummary {
  perClass: { classAssignmentId: string; subject: string; percentage: number }[];
  overallPercentage: number;
}

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [upcomingTest, setUpcomingTest] = useState<TestSummary | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [meRes, testsRes, attemptsRes, attendanceRes] = await Promise.all([
          fetch(`${API_URL}/users/me`, { headers: authHeaders() }),
          fetch(`${API_URL}/tests`, { headers: authHeaders() }),
          fetch(`${API_URL}/students/me/attempts`, { headers: authHeaders() }),
          fetch(`${API_URL}/students/me/attendance`, { headers: authHeaders() }),
        ]);

        if (meRes.ok) setMe(await meRes.json());
        if (testsRes.ok) {
          const tests: TestSummary[] = await testsRes.json();
          const next = tests.find((t) => t.status === "live" || t.status === "scheduled");
          setUpcomingTest(next ?? null);
        }
        if (attemptsRes.ok) setAttempts(await attemptsRes.json());
        if (attendanceRes.ok) setAttendance(await attendanceRes.json());
      } catch {
        setError("Couldn't reach the server. Is the backend running?");
      }
    }
    load();
  }, []);

  const firstName = me?.fullName?.split(" ")[0] ?? "";

  const scoreRows: ScoreRow[] = attempts.map((a) => ({
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

      <section>
        <h2 className="mb-4 font-serif text-headline-md text-on-surface">Attendance summary</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {attendance?.perClass.map((c) => (
            <ProgressRing
              key={c.classAssignmentId}
              percent={c.percentage}
              label={c.subject}
              sublabel=""
            />
          ))}
          {attendance && (
            <StatCard
              label="Overall attendance"
              value={`${attendance.overallPercentage}%`}
              sublabel={attendance.overallPercentage >= 75 ? "Eligible for finals" : "Below threshold"}
            />
          )}
          {!attendance && <p className="text-body-sm text-on-surface-variant">No attendance recorded yet.</p>}
        </div>
      </section>
    </main>
  );
}
