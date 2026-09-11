"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  // test, the backend withholds `answers` (empty array), so an early
  // finisher can't see or leak the correct answers to anyone still mid-test.
  resultsAvailable: boolean;
  answers: ResultAnswer[];
}

export default function ResultsPage() {
  const ready = useAuthGuard(["student"]);
  const params = useParams();
  const router = useRouter();
  const attemptId = params.attemptId as string;

  const [result, setResult] = useState<AttemptResult | null>(null);
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

  useEffect(() => {
    if (!ready) return;
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attemptId]);

  // The "you'll be notified" promise — a test_status_changed -> "ended"
  // re-fetches the result live (now unlocked, revealing the answer
  // breakdown) with no manual refresh needed.
  useEffect(() => {
    if (!ready || !result) return;
    const testId = result.testId;
    const socket = getSocket();
    socket.emit("test:join", { testId });

    function handleEvent(event: { type: string; status?: string }) {
      if (event.type === "test_status_changed" && event.status === "ended") {
        loadResult();
      }
    }
    socket.on("test:event", handleEvent);

    return () => {
      socket.off("test:event", handleEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, result?.testId]);

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
            You&apos;ll be notified when the test has ended — the full question breakdown will be
            available then.
          </p>
        </Card>
      ) : (
        <>
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
