import { Badge } from "@/components/ui/Badge";

export interface LiveStudentRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  batch: string;
  violationCount: number;
}

// Violation-count tone mapping — keep this the one place that decides the
// sage/gold/crimson thresholds so the coordinator table and any future
// admin view agree on what "concerning" means.
function violationTone(count: number): "sage" | "gold" | "crimson" {
  if (count === 0) return "sage";
  if (count <= 2) return "gold";
  return "crimson";
}

export function LiveMonitoringTable({ rows }: { rows: LiveStudentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center text-body-md text-on-surface-variant">
        No students have joined this test yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="p-4 text-label-caps text-on-surface-variant">Student</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Batch</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Violations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.attemptId} className="border-b border-outline-variant last:border-0">
              <td className="min-h-14 p-4 text-body-md text-on-surface">{row.studentName}</td>
              <td className="p-4 text-body-sm text-on-surface-variant">{row.batch}</td>
              <td className="p-4">
                <Badge tone={violationTone(row.violationCount)}>{row.violationCount}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
