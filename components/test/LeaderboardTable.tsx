import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface LeaderboardEntry {
  rank: number;
  rollNo: string;
  fullName: string;
  batch: string;
  section: string;
  score: number;
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function OverallWinnerBanner({ winner, maxScore }: { winner: LeaderboardEntry | null; maxScore?: number }) {
  if (!winner) return null;
  return (
    <Card className="mb-4 flex items-center gap-3 bg-primary/5">
      <span className="text-headline-sm">🏆</span>
      <div>
        <p className="text-body-sm text-on-surface-variant">Overall winner</p>
        <p className="font-serif text-title-md text-on-surface">
          {winner.fullName} <span className="text-on-surface-variant">({winner.rollNo})</span> —{" "}
          {maxScore !== undefined ? `${winner.score}/${maxScore}` : `${winner.score} pts`}
        </p>
      </div>
    </Card>
  );
}

export function LeaderboardTable({
  entries,
  highlightRank,
  maxScore,
}: {
  entries: LeaderboardEntry[];
  highlightRank?: number | null;
  maxScore?: number;
}) {
  if (entries.length === 0) {
    return (
      <Card className="text-center text-body-sm text-on-surface-variant">
        No submitted attempts yet — the leaderboard fills in as students finish.
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface-container-low">
            <tr className="border-b border-outline-variant">
              <th className="p-3 text-label-caps text-on-surface-variant">Rank</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Name</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Roll No</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Batch</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Section</th>
              <th className="p-3 text-label-caps text-on-surface-variant">Score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isMe = e.rank === highlightRank;
              return (
                <tr
                  key={e.rollNo}
                  className={`border-b border-outline-variant transition-colors last:border-0 ${
                    isMe ? "bg-primary/5" : "hover:bg-surface-container-low"
                  }`}
                >
                  <td className="p-3 font-serif font-semibold text-on-surface">
                    {MEDALS[e.rank] ?? `#${e.rank}`}
                  </td>
                  <td className="p-3 text-body-sm text-on-surface">
                    {e.fullName} {isMe && <Badge tone="neutral">You</Badge>}
                  </td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{e.rollNo}</td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{e.batch}</td>
                  <td className="p-3 text-body-sm text-on-surface-variant">{e.section}</td>
                  <td className="p-3 font-serif font-semibold text-on-surface">
                    {maxScore !== undefined ? `${e.score}/${maxScore}` : e.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
