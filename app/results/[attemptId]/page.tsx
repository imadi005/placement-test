"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LeaderboardTable, LeaderboardEntry, OverallWinnerBanner } from "@/components/test/LeaderboardTable";
import { ProblemWinnersCard, ProblemWinner } from "@/components/test/ProblemWinnersCard";
import { QuestionResultCard, ResultAnswer } from "@/components/test/QuestionResultCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";
import { getSocket } from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface AttemptResult {
  id: string;
  testId: string;
  status: string;
  mcqScore: string | null;
  finalScore: string | null;
  maxScore: number;
  testStatus: string;
  // Server-enforced, not just a UI toggle — until the coordinator ends the
  // test, the backend withholds `answers` (empty array) and the leaderboard
  // endpoint 403s for students, so an early finisher can't see or leak the
  // correct answers to anyone still mid-test.
  resultsAvailable: boolean;
  answers: ResultAnswer[];
}
interface Leaderboard {
  entries: LeaderboardEntry[];
  maxScore: number;
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

  async function loadResult() {
    const res = await authFetch(`${API_URL}/attempts/${attemptId}/result`);
    if (!res.ok) {
      setError("Couldn't load this result.");
      return null;
    }
    const data: AttemptResult = await res.json();
    setResult(data);
    return data;
  }

  async function loadLeaderboard(testId: string) {
    const lbRes = await authFetch(`${API_URL}/tests/${testId}/leaderboard`);
    if (lbRes.ok) setLeaderboard(await lbRes.json());
  }

  useEffect(() => {
    if (!ready) return;
    async function load() {
      const data = await loadResult();
      // Fetching the leaderboard before the test has ended would just 403 —
      // don't bother, the gate is re-checked the moment resultsAvailable
      // flips (see the socket effect below).
      if (data?.resultsAvailable) await loadLeaderboard(data.testId);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attemptId]);

  // Live-updating — two different things react to this socket room:
  // 1. Once results are already available, every attempt_submitted
  //    refreshes the leaderboard (rank/participant count keep moving as
  //    more students finish).
  // 2. Before that, a test_status_changed -> "ended" is the actual "you'll
  //    be notified" promise — it re-fetches the result (now unlocked,
  //    revealing the answer breakdown) and the leaderboard, live, with no
  //    manual refresh needed.
  useEffect(() => {
    if (!ready || !result) return;
    const testId = result.testId;
    const socket = getSocket();
    socket.emit("test:join", { testId });

    function handleEvent(event: { type: string; status?: string }) {
      if (event.type === "attempt_submitted") {
        loadLeaderboard(testId);
      } else if (event.type === "test_status_changed" && event.status === "ended") {
        (async () => {
          const data = await loadResult();
          if (data?.resultsAvailable) await loadLeaderboard(testId);
        })();
      }
    }
    socket.on("test:event", handleEvent);

    // Fallback poll — only meaningful once results are unlocked (polling
    // the leaderboard before that would just 403 repeatedly for nothing).
    const pollInterval = setInterval(() => {
      if (result.resultsAvailable) loadLeaderboard(testId);
    }, 8000);

    return () => {
      socket.off("test:event", handleEvent);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, result?.testId, result?.resultsAvailable]);

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
          {displayScore ?? "—"}/{result.maxScore}
        </p>
        <Badge tone="sage" className="mt-3">
          Graded
        </Badge>
      </Card>

      {!result.resultsAvailable ? (
        <Card className="mb-8 text-center shadow-soft-ink">
          <p className="text-body-md text-on-surface">Thank you for submitting!</p>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            You&apos;ll be notified when the test has ended — the leaderboard and full question
            breakdown will be available then.
          </p>
        </Card>
      ) : (
        <>
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
              <p className="mt-1 text-label-caps text-on-surface-variant">Updates live as more students submit</p>
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
              <OverallWinnerBanner winner={leaderboard.overallWinner} maxScore={leaderboard.maxScore} />
              {leaderboard.problemWinners.length > 0 && (
                <div className="mb-4">
                  <ProblemWinnersCard problems={leaderboard.problemWinners} />
                </div>
              )}
              <LeaderboardTable entries={leaderboard.entries} highlightRank={leaderboard.myRank} maxScore={leaderboard.maxScore} />
            </div>
          )}

          <h2 className="mb-4 font-serif text-headline-md text-on-surface">Question breakdown</h2>
          <div className="flex flex-col gap-3">
            {result.answers.map((a, i) => (
              <QuestionResultCard key={a.id} answer={a} index={i} />
            ))}
          </div>
        </>
      )}

      <Button className="mt-8 w-full" onClick={() => router.push("/dashboard")}>
        Return to dashboard
      </Button>
    </main>
  );
}
