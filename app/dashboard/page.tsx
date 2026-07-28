import { UpcomingTestCard } from "@/components/dashboard/UpcomingTestCard";
import { ScoreHistoryTable, ScoreRow } from "@/components/dashboard/ScoreHistoryTable";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StatCard } from "@/components/ui/StatCard";

// Placeholder data — replace with a server-side fetch to the NestJS API
// (GET /students/me/dashboard) once the backend is wired up.
const scoreRows: ScoreRow[] = [
  { testName: "Data Structures & Algorithms", dateCompleted: "Sept 12, 2026", score: "88/100", status: "graded" },
  { testName: "Database Management Systems", dateCompleted: "Aug 28, 2026", score: "76/100", status: "graded" },
  { testName: "Logical Reasoning & Aptitude", dateCompleted: "Aug 15, 2026", score: "—", status: "pending_grading" },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-8">
        <h1 className="font-serif text-display-lg-mobile text-on-surface md:text-display-lg">
          Hello, Alexander.
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Welcome back. You have one upcoming assessment.
        </p>
      </header>

      <section className="mb-10">
        <UpcomingTestCard
          title="Systems Architecture Placement"
          description="Final evaluation for the Technical Architect stream. Ensure your environment is set up 15 minutes prior."
          date="Oct 24, 2026"
          durationLabel="10:00 AM (2h)"
          hoursUntilStart={62}
        />
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-headline-md text-on-surface">Assessment performance</h2>
          <a href="/dashboard/results" className="text-body-sm text-primary underline underline-offset-2">
            View all
          </a>
        </div>
        <ScoreHistoryTable rows={scoreRows} />
      </section>

      <section>
        <h2 className="mb-4 font-serif text-headline-md text-on-surface">Attendance summary</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ProgressRing percent={90} label="Mathematics" sublabel="18/20 lectures" />
          <ProgressRing percent={75} label="Physics" sublabel="15/20 lectures" color="#735c00" />
          <ProgressRing percent={95} label="Operating Systems" sublabel="19/20 lectures" color="#4e635a" />
          <StatCard label="Overall attendance" value="86%" sublabel="Eligible for finals" />
        </div>
      </section>
    </main>
  );
}
