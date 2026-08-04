"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { CATEGORICAL_COLORS, CHART_GRID, axisTick, tooltipStyle } from "@/components/analytics/chart-theme";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// "12 min" alone hid the seconds that actually decide a same-score tie —
// two attempts both rounding to "12 min" could be 12m 04s and 12m 51s.
// `== null` (not `=== null`) also covers `undefined` — the frontend and
// backend deploy independently (Vercel/Render), so there's always a window
// where this field doesn't exist yet in the API response after a schema
// change; that should render "—", not "NaNm NaNs".
function formatTimeTaken(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

interface GroupStat {
  attempted: number;
  avgScore: number;
  highScore: number;
  lowScore: number;
  avgViolations: number;
  [key: string]: unknown;
}
interface QuestionStat {
  questionId: string;
  questionOrder: number;
  questionText: string;
  maxMarks: number;
  answeredCount: number;
  correctCount: number;
  correctPct: number;
}
interface StudentRow {
  attemptId: string;
  rollNo: string;
  fullName: string;
  batch: string;
  section: string;
  status: string;
  mcqScore: number | null;
  finalScore: number | null;
  violationCount: number;
  timeTakenMinutes: number | null;
  timeTakenSeconds?: number | null;
}
interface Analytics {
  test: { id: string; title: string; batchScope: string; maxScore: number };
  overview: {
    totalEligible: number;
    totalAttempted: number;
    totalSubmitted: number;
    inProgressCount: number;
    pendingGradingCount: number;
    completionRate: number;
    avgScore: number;
    medianScore: number;
    highScore: number;
    lowScore: number;
    maxPossibleScore: number;
    avgViolations: number;
    flaggedCount: number;
    studentsWithViolations: number;
  };
  byBatch: GroupStat[];
  bySection: GroupStat[];
  byQuestion: QuestionStat[];
  distribution: { label: string; count: number }[];
  violationsByType: { type: string; count: number }[];
  students: StudentRow[];
}

const STATUS_TONE: Record<string, "sage" | "gold" | "crimson" | "neutral"> = {
  graded: "sage",
  pending_grading: "gold",
  flagged: "crimson",
  submitted: "sage",
  auto_submitted: "gold",
  in_progress: "neutral",
};

export default function TestAnalyticsPage() {
  const ready = useAuthGuard(["coordinator", "admin"]);
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [batchFilter, setBatchFilter] = useState("ALL");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!ready) return;
    async function load() {
      try {
        const res = await authFetch(`${API_URL}/tests/${testId}/analytics`);
        if (!res.ok) {
          setError("Couldn't load analytics for this test.");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Couldn't reach the server. Is the backend running?");
      }
    }
    load();
  }, [ready, testId]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await authFetch(`${API_URL}/tests/${testId}/analytics/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.test.title ?? "test"}-report.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't generate the Excel report.");
    } finally {
      setIsExporting(false);
    }
  }

  const sections = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.students.map((s) => s.section))].sort();
  }, [data]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    return data.students.filter((s) => {
      if (batchFilter !== "ALL" && s.batch !== batchFilter) return false;
      if (sectionFilter !== "ALL" && s.section !== sectionFilter) return false;
      if (search && !`${s.fullName} ${s.rollNo}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, batchFilter, sectionFilter, search]);

  if (!ready) return null;

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-body-md text-error">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading analytics…</p>
      </main>
    );
  }

  const { overview } = data;

  return (
    <main className="mx-auto max-w-container animate-fade-in-up px-4 py-8 md:px-gutter">
      <Button variant="ghost" className="mb-4" onClick={() => router.push("/coordinator")}>
        ← Back to coordinator
      </Button>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-headline-md text-on-surface">{data.test.title}</h1>
            <Badge tone="neutral">Batch scope: {data.test.batchScope}</Badge>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Full performance report — every batch, every section, question-by-question.
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Preparing…" : "⬇ Download Excel report"}
        </Button>
      </header>

      {/* Overview stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total eligible" value={String(overview.totalEligible)} />
        <StatCard label="Attempted" value={String(overview.totalAttempted)} />
        <StatCard label="Submitted" value={String(overview.totalSubmitted)} />
        <StatCard label="Completion rate" value={`${(overview.completionRate * 100).toFixed(0)}%`} />
        <StatCard
          label="Average score"
          value={`${overview.avgScore.toFixed(1)} / ${overview.maxPossibleScore}`}
        />
        <StatCard label="Median score" value={overview.medianScore.toFixed(1)} />
        <StatCard label="High / Low" value={`${overview.highScore} / ${overview.lowScore}`} />
        <StatCard
          label="Students with violations"
          value={String(overview.studentsWithViolations)}
          valueClassName={overview.studentsWithViolations > 0 ? "text-error" : undefined}
          sublabel={overview.flaggedCount > 0 ? `${overview.flaggedCount} auto-submitted (5+ violations)` : undefined}
        />
      </div>

      {/* Charts grid */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ChartCard title="Score distribution" subtitle="Students grouped by % of max possible score">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,92,82,0.06)" }} />
              <Bar dataKey="count" name="Students" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average score by batch" subtitle="Batch A / B / C comparison">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byBatch} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="batch" tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,92,82,0.06)" }} />
              <Bar dataKey="avgScore" name="Avg score" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average score by section" subtitle="Academic section comparison">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bySection} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="section" tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,92,82,0.06)" }} />
              <Bar dataKey="avgScore" name="Avg score" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Violations by type" subtitle="Proctoring events across every attempt">
          {data.violationsByType.length === 0 ? (
            <div className="flex h-full items-center justify-center text-body-sm text-on-surface-variant">
              No violations recorded — clean run.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={tooltipStyle} />
                <Pie
                  data={data.violationsByType}
                  dataKey="count"
                  nameKey="type"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.violationsByType.map((_, i) => (
                    <Cell key={i} fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Question difficulty */}
      <ChartCard title="Question-by-question difficulty" subtitle="% of students who answered each MCQ correctly">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.byQuestion.map((q) => ({
              label: `Q${q.questionOrder}`,
              value: Math.round(q.correctPct * 100),
              questionText: q.questionText,
            }))}
            margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          >
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "rgba(15,92,82,0.06)" }}
              formatter={(value: any) => [`${value}% correct`, ""]}
              labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.questionText ?? label}
            />
            <Bar dataKey="value" name="Correct %" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Per-student table */}
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-headline-md text-on-surface">Student breakdown</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or roll no…"
            className="h-9 w-48 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-sm text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
          />
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="h-9 rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 text-body-sm text-on-surface"
          >
            <option value="ALL">All batches</option>
            {data.byBatch.map((b: any) => (
              <option key={b.batch} value={b.batch}>
                Batch {b.batch}
              </option>
            ))}
          </select>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="h-9 rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 text-body-sm text-on-surface"
          >
            <option value="ALL">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="p-0">
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-container-low">
              <tr className="border-b border-outline-variant">
                <th className="p-3 text-label-caps text-on-surface-variant">Roll No</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Name</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Batch</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Section</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Status</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Score</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Violations</th>
                <th className="p-3 text-label-caps text-on-surface-variant">Time taken</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => (
                <tr key={s.attemptId} className="border-b border-outline-variant transition-colors last:border-0 hover:bg-surface-container-low">
                  <td className="p-3 text-body-sm text-on-surface">{s.rollNo}</td>
                  <td className="p-3 text-body-sm text-on-surface">{s.fullName}</td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{s.batch}</td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{s.section}</td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="p-3 font-serif font-semibold text-on-surface">
                    {s.finalScore ?? s.mcqScore ?? "—"}
                  </td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{s.violationCount}</td>
                  <td className="p-3 text-body-sm text-on-surface-variant">
                    {formatTimeTaken(s.timeTakenSeconds)}
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-body-sm text-on-surface-variant">
                    No students match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
