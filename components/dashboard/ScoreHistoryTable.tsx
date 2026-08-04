"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";

export interface ScoreRow {
  attemptId: string;
  testName: string;
  dateCompleted: string;
  score: string | null;
  maxScore: number;
  status: "graded";
}

// Chevron-turned-arrow — just a visual affordance that the row navigates
// somewhere, not an expand/collapse toggle anymore.
function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-on-surface-variant">
      <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Each row used to expand an inline accordion with the answer breakdown.
// The full review page at /results/[attemptId] (already used right after a
// student submits) is richer — score, rank, leaderboard, per-question
// marks — so a row click now goes straight there instead of duplicating a
// thinner version of the same data inline.
export function ScoreHistoryTable({ rows }: { rows: ScoreRow[] }) {
  const router = useRouter();

  return (
    <Card className="p-0">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="p-4 text-label-caps text-on-surface-variant">Test module</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Date completed</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.attemptId}
              onClick={() => router.push(`/results/${row.attemptId}`)}
              className="cursor-pointer border-b border-outline-variant transition-colors last:border-0 hover:bg-surface-container-low"
            >
              <td className="min-h-14 p-4 text-body-md text-on-surface">
                <div className="flex items-center gap-2">
                  <ArrowIcon />
                  {row.testName}
                </div>
              </td>
              <td className="p-4 text-body-sm text-on-surface-variant">{row.dateCompleted}</td>
              <td className="p-4">
                <span className="font-serif font-semibold text-on-surface">
                  {row.score !== null ? `${row.score}/${row.maxScore}` : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
