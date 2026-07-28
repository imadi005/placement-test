import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface ScoreRow {
  testName: string;
  dateCompleted: string;
  score: string;
  status: "graded" | "pending_grading";
}

export function ScoreHistoryTable({ rows }: { rows: ScoreRow[] }) {
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
            <tr key={row.testName} className="border-b border-outline-variant last:border-0">
              <td className="min-h-14 p-4 text-body-md text-on-surface">{row.testName}</td>
              <td className="p-4 text-body-sm text-on-surface-variant">{row.dateCompleted}</td>
              <td className="p-4">
                {row.status === "pending_grading" ? (
                  <Badge tone="gold">Pending grading</Badge>
                ) : (
                  <span className="font-serif font-semibold text-on-surface">{row.score}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
