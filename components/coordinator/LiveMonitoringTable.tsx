import { Badge } from "@/components/ui/Badge";

export interface LiveStudentRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  section: string;
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function StudentRow({ row }: { row: LiveStudentRow }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-4 py-3 transition-colors last:border-0 hover:bg-surface-container-low">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container font-serif text-label-caps text-on-primary">
          {initials(row.studentName)}
        </span>
        <span className="truncate text-body-md text-on-surface">{row.studentName}</span>
      </div>
      {/* Violation count sits directly beside the name it belongs to —
          no scanning across a wide row to match a student to their count. */}
      <Badge tone={violationTone(row.violationCount)} className="shrink-0">
        {row.violationCount === 0 ? "No violations" : `${row.violationCount} violation${row.violationCount === 1 ? "" : "s"}`}
      </Badge>
    </div>
  );
}

// Grouped Section → Batch → student, matching how a coordinator actually
// thinks about a cohort ("who's live in MCA A, batch A right now") rather
// than one long flat list they have to scan for a name.
export function LiveMonitoringTable({ rows }: { rows: LiveStudentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center text-body-md text-on-surface-variant">
        No students have joined this test yet.
      </div>
    );
  }

  const bySection = new Map<string, Map<string, LiveStudentRow[]>>();
  for (const row of rows) {
    if (!bySection.has(row.section)) bySection.set(row.section, new Map());
    const byBatch = bySection.get(row.section)!;
    if (!byBatch.has(row.batch)) byBatch.set(row.batch, []);
    byBatch.get(row.batch)!.push(row);
  }

  const sections = [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      {sections.map(([section, byBatch]) => {
        const sectionTotal = [...byBatch.values()].reduce((sum, r) => sum + r.length, 0);
        const sectionViolations = [...byBatch.values()]
          .flat()
          .reduce((sum, r) => sum + r.violationCount, 0);
        const batches = [...byBatch.entries()].sort(([a], [b]) => a.localeCompare(b));

        return (
          <div key={section} className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-soft-ink">
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3">
              <h3 className="font-serif text-body-lg font-semibold text-on-surface">{section}</h3>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{sectionTotal} active</Badge>
                {sectionViolations > 0 && <Badge tone="crimson">{sectionViolations} violations</Badge>}
              </div>
            </div>

            {batches.map(([batch, students]) => (
              <div key={batch}>
                <p className="bg-surface-container-lowest px-4 pt-3 text-label-caps text-on-surface-variant">
                  Batch {batch} · {students.length}
                </p>
                {students
                  .slice()
                  .sort((a, b) => b.violationCount - a.violationCount)
                  .map((row) => (
                    <StudentRow key={row.attemptId} row={row} />
                  ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
