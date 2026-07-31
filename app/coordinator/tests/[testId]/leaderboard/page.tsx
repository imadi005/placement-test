"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LeaderboardTable, LeaderboardEntry, OverallWinnerBanner } from "@/components/test/LeaderboardTable";
import { ProblemWinnersCard, ProblemWinner } from "@/components/test/ProblemWinnersCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface Leaderboard {
  testTitle: string;
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

  useEffect(() => {
    if (!ready) return;
    async function load() {
      const res = await fetch(`${API_URL}/tests/${testId}/leaderboard`, { headers: authHeaders() });
      if (res.ok) setData(await res.json());
      else setError("Couldn't load the leaderboard for this test.");
    }
    load();
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
          {data ? `${data.totalParticipants} student${data.totalParticipants === 1 ? "" : "s"} ranked` : "Loading…"}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      {data && <OverallWinnerBanner winner={data.overallWinner} />}
      {data && data.problemWinners.length > 0 && (
        <div className="mb-6">
          <ProblemWinnersCard problems={data.problemWinners} />
        </div>
      )}
      {data && <LeaderboardTable entries={data.entries} />}
    </main>
  );
}
