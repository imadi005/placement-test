import { Card } from "@/components/ui/Card";

export interface ProblemWinner {
  questionId: string;
  questionOrder: number;
  questionText: string;
  winner: {
    studentId: string;
    rollNo: string;
    fullName: string;
    score: number;
    maxScore: number;
    execTimeMs: number | null;
    memoryKb: number | null;
  } | null;
}

function shortLabel(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

function formatMemory(kb: number | null): string {
  if (kb === null) return "—";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export function ProblemWinnersCard({ problems }: { problems: ProblemWinner[] }) {
  if (problems.length === 0) return null;

  return (
    <Card className="p-0">
      <div className="border-b border-outline-variant p-4">
        <h2 className="font-serif text-title-md text-on-surface">Most optimized code — per problem</h2>
        <p className="mt-0.5 text-body-sm text-on-surface-variant">
          Winner is whoever scored highest on that problem; ties broken by lowest execution time, then lowest memory.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="p-3 text-label-caps text-on-surface-variant">Problem</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Winner</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Score</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Time</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Memory</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.questionId} className="border-b border-outline-variant last:border-0">
                <td className="p-3 text-body-sm text-on-surface">
                  <span className="font-semibold">Q{p.questionOrder}</span>{" "}
                  <span className="text-on-surface-variant">{shortLabel(p.questionText)}</span>
                </td>
                {p.winner ? (
                  <>
                    <td className="p-3 text-body-sm text-on-surface">
                      🏆 {p.winner.fullName} <span className="text-on-surface-variant">({p.winner.rollNo})</span>
                    </td>
                    <td className="p-3 font-serif font-semibold text-on-surface">
                      {p.winner.score}/{p.winner.maxScore}
                    </td>
                    <td className="p-3 text-body-sm text-on-surface-variant">
                      {p.winner.execTimeMs !== null ? `${p.winner.execTimeMs} ms` : "—"}
                    </td>
                    <td className="p-3 text-body-sm text-on-surface-variant">{formatMemory(p.winner.memoryKb)}</td>
                  </>
                ) : (
                  <td className="p-3 text-body-sm text-on-surface-variant" colSpan={4}>
                    No scoring submissions yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
