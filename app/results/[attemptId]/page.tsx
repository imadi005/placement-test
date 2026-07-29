"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface ResultAnswer {
  id: string;
  question: { questionText: string; questionType: string; marks: string };
  marksAwarded: string | null;
}
interface AttemptResult {
  id: string;
  status: string;
  mcqScore: string | null;
  finalScore: string | null;
  answers: ResultAnswer[];
}

export default function ResultsPage() {
  const ready = useAuthGuard(["student"]);
  const params = useParams();
  const router = useRouter();
  const attemptId = params.attemptId as string;

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    async function load() {
      const res = await fetch(`${API_URL}/attempts/${attemptId}/result`, { headers: authHeaders() });
      if (res.ok) {
        setResult(await res.json());
      } else {
        setError("Couldn't load this result.");
      }
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

  const isPending = result.status === "pending_grading";
  const displayScore = isPending ? result.mcqScore : result.finalScore ?? result.mcqScore;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Card className="mb-8 text-center">
        <p className="text-label-caps text-on-surface-variant">Test completion summary</p>
        <p className="mt-3 font-serif text-score-xl text-primary">{displayScore ?? "—"}</p>
        {isPending ? (
          <Badge tone="gold" className="mt-3">
            Final score pending — descriptive answers awaiting review
          </Badge>
        ) : (
          <Badge tone="sage" className="mt-3">
            Graded
          </Badge>
        )}
      </Card>

      <h2 className="mb-4 font-serif text-headline-md text-on-surface">Question breakdown</h2>
      <div className="flex flex-col gap-3">
        {result.answers.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md text-on-surface">{a.question.questionText}</p>
              <p className="text-label-caps text-on-surface-variant">
                {a.question.questionType.toUpperCase()} · {a.question.marks} marks
              </p>
            </div>
            {a.question.questionType !== "mcq" && a.marksAwarded === null ? (
              <Badge tone="gold">Pending grading</Badge>
            ) : (
              <span className="font-serif font-semibold text-on-surface">
                {a.marksAwarded ?? "0"}
              </span>
            )}
          </Card>
        ))}
      </div>

      <Button className="mt-8 w-full" onClick={() => router.push("/dashboard")}>
        Return to dashboard
      </Button>
    </main>
  );
}
