"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LeaderboardTable, LeaderboardEntry, OverallWinnerBanner } from "@/components/test/LeaderboardTable";
import { ProblemWinnersCard, ProblemWinner } from "@/components/test/ProblemWinnersCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface ResultAnswer {
  id: string;
  question: { questionText: string; marks: string };
  marksAwarded: string | null;
}
interface AttemptResult {
  id: string;
  testId: string;
  status: string;
  mcqScore: string | null;
  finalScore: string | null;
  answers: ResultAnswer[];
}
interface Leaderboard {
  entries: LeaderboardEntry[];
  totalParticipants: number;
  myRank: number | null;
  myScore: number | null;
  problemWinners: ProblemWinner[];
  overallWinner: LeaderboardEntry | null;
}

export default function ResultsPage() {
  const ready = useAuthGuard(["student"]);
  const params = useParams();
  const router = useRouter();
  const attemptId = params.attemptId as string;

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    async function load() {
      const res = await fetch(`${API_URL}/attempts/${attemptId}/result`, { headers: authHeaders() });
      if (!res.ok) {
        setError("Couldn't load this result.");
        return;
      }
      const data: AttemptResult = await res.json();
      setResult(data);

      const lbRes = await fetch(`${API_URL}/tests/${data.testId}/leaderboard`, { headers: authHeaders() });
      if (lbRes.ok) setLeaderboard(await lbRes.json());
    }
    load();
  }, [ready, attemptId]);

  if (!ready) return null;

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body-md text-error">{error}</p>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading result…</p>
      </main>
    );
  }

  const displayScore = result.finalScore ?? result.mcqScore;
  const aheadOfCount =
    leaderboard && leaderboard.myRank ? leaderboard.totalParticipants - leaderboard.myRank : null;

  return (
    <main className="mx-auto max-w-2xl animate-fade-in-up px-4 py-8">
      <Card className="mb-8 text-center shadow-soft-ink-lg">
        <p className="text-label-caps text-on-surface-variant">Test completion summary</p>
        <p className="mt-3 bg-gradient-to-br from-primary to-primary-container bg-clip-text font-serif text-score-xl text-transparent">
          {displayScore ?? "—"}
        </p>
        <Badge tone="sage" className="mt-3">
          Graded
        </Badge>
      </Card>

      {leaderboard && leaderboard.myRank && (
        <Card className="mb-8 text-center shadow-soft-ink">
          <p className="text-label-caps text-on-surface-variant">Your rank</p>
          <p className="mt-2 font-serif text-3xl font-bold text-on-surface">
            #{leaderboard.myRank} <span className="text-body-md font-normal text-on-surface-variant">of {leaderboard.totalParticipants}</span>
          </p>
          {aheadOfCount !== null && aheadOfCount > 0 && (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              You're ahead of {aheadOfCount} student{aheadOfCount === 1 ? "" : "s"}.
            </p>
          )}
          <button
            onClick={() => setShowFullLeaderboard((v) => !v)}
            className="mt-3 text-body-sm text-primary underline underline-offset-4 hover:text-primary-container"
          >
            {showFullLeaderboard ? "Hide full leaderboard" : "View full leaderboard"}
          </button>
        </Card>
      )}

      {showFullLeaderboard && leaderboard && (
        <div className="mb-8">
          <OverallWinnerBanner winner={leaderboard.overallWinner} />
          {leaderboard.problemWinners.length > 0 && (
            <div className="mb-4">
              <ProblemWinnersCard problems={leaderboard.problemWinners} />
            </div>
          )}
          <LeaderboardTable entries={leaderboard.entries} highlightRank={leaderboard.myRank} />
        </div>
      )}

      <h2 className="mb-4 font-serif text-headline-md text-on-surface">Question breakdown</h2>
      <div className="flex flex-col gap-3">
        {result.answers.map((a) => (
          <Card key={a.id} className="flex items-center justify-between hover:border-outline">
            <div>
              <p className="text-body-md text-on-surface">{a.question.questionText}</p>
              <p className="text-label-caps text-on-surface-variant">{a.question.marks} marks</p>
            </div>
            <span className="font-serif font-semibold text-on-surface">{a.marksAwarded ?? "0"}</span>
          </Card>
        ))}
      </div>

      <Button className="mt-8 w-full" onClick={() => router.push("/dashboard")}>
        Return to dashboard
      </Button>
    </main>
  );
}
