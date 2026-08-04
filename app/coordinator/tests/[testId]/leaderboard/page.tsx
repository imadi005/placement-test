"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LeaderboardTable, LeaderboardEntry, OverallWinnerBanner } from "@/components/test/LeaderboardTable";
import { ProblemWinnersCard, ProblemWinner } from "@/components/test/ProblemWinnersCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";
import { getSocket } from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Leaderboard {
  testTitle: string;
  maxScore: number;
  entries: LeaderboardEntry[];
  totalParticipants: number;
  problemWinners: ProblemWinner[];
  overallWinner: LeaderboardEntry | null;
}

export default function CoordinatorLeaderboardPage() {
  const ready = useAuthGuard(["coordinator", "admin"]);
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await authFetch(`${API_URL}/tests/${testId}/leaderboard`);
    if (res.ok) setData(await res.json());
    else setError("Couldn't load the leaderboard for this test.");
  }

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, testId]);

  // Live, same as the student results page — a coordinator watching this
  // screen while students are still finishing up used to only ever see
  // whoever had submitted at the moment they first loaded the page.
  useEffect(() => {
    if (!ready) return;
    const socket = getSocket();
    socket.emit("test:join", { testId });

    function handleEvent(event: { type: string }) {
      if (event.type === "attempt_submitted") load();
    }
    socket.on("test:event", handleEvent);

    const pollInterval = setInterval(load, 8000);

    return () => {
      socket.off("test:event", handleEvent);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, testId]);

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-container animate-fade-in-up px-4 py-8 md:px-gutter">
      <Button variant="ghost" className="mb-4" onClick={() => router.push("/coordinator")}>
        ← Back to coordinator
      </Button>

      <header className="mb-6">
        <h1 className="font-serif text-headline-md text-on-surface">{data?.testTitle ?? "Leaderboard"}</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {data ? `${data.totalParticipants} student${data.totalParticipants === 1 ? "" : "s"} ranked · updates live` : "Loading…"}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      {data && <OverallWinnerBanner winner={data.overallWinner} maxScore={data.maxScore} />}
      {data && data.problemWinners.length > 0 && (
        <div className="mb-6">
          <ProblemWinnersCard problems={data.problemWinners} />
        </div>
      )}
      {data && <LeaderboardTable entries={data.entries} maxScore={data.maxScore} />}
    </main>
  );
}
