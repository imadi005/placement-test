"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { QuestionReviewCard, EditableQuestion } from "@/components/questions/QuestionReviewCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(json = true) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export default function QuestionReviewPage() {
  const ready = useAuthGuard(["coordinator"]);
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);

  // Pick up an already-committed set (e.g. a draft closed out mid-flow that
  // already has questions from a previous commit) rather than always
  // starting from a blank slate.
  useEffect(() => {
    if (!ready) return;
    async function loadExisting() {
      try {
        const res = await fetch(`${API_URL}/tests/${testId}/questions`, { headers: authHeaders() });
        if (res.ok) {
          const existing: Array<{
            questionText: string;
            questionOrder: number;
            questionType: string;
            modelAnswer: string | null;
            rubricNotes: string | null;
            options: { optionText: string; isCorrect: boolean }[];
          }> = await res.json();
          if (existing.length > 0) {
            setQuestions(
              existing.map((q) => ({
                questionText: q.questionText,
                questionOrder: q.questionOrder,
                questionType: q.questionType,
                modelAnswer: q.modelAnswer,
                rubricNotes: q.rubricNotes,
                options: q.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })),
              }))
            );
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadExisting();
  }, [ready, testId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/tests/${testId}/questions/parse-preview`, {
        method: "POST",
        headers: authHeaders(false),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Couldn't parse this file.");
        return;
      }

      const draft: Array<{
        questionText: string;
        questionOrder: number;
        questionType: string;
        options: { label: string; text: string; isCorrect: boolean }[];
        modelAnswer?: string | null;
        parseWarning?: string | null;
      }> = await res.json();

      setQuestions(
        draft.map((q) => ({
          ...q,
          options: q.options.map((o) => ({ optionText: o.text, isCorrect: o.isCorrect })),
        }))
      );
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsUploading(false);
    }
  }

  function updateQuestion(index: number, updated: EditableQuestion) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlankQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        questionText: "",
        questionOrder: prev.length + 1,
        questionType: "mcq",
        options: [
          { optionText: "", isCorrect: true },
          { optionText: "", isCorrect: false },
          { optionText: "", isCorrect: false },
          { optionText: "", isCorrect: false },
        ],
      },
    ]);
  }

  async function handleCommit() {
    setIsCommitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/tests/${testId}/questions/commit`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ questions }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Couldn't save this question set.");
        return;
      }

      const approveRes = await fetch(`${API_URL}/tests/${testId}/approve-questions`, {
        method: "POST",
        headers: authHeaders(false),
      });
      if (!approveRes.ok) {
        setError("Questions saved, but couldn't mark them approved. Try again.");
        return;
      }

      setCommitted(true);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsCommitting(false);
    }
  }

  if (!ready) return null;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-headline-md text-on-surface">Question bank review</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Upload a .docx/.pdf question set, fix anything the parser flagged, then commit before
            scheduling this test.
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/coordinator")}>
          ← Back to coordinator
        </Button>
      </header>

      {questions.length === 0 && (
        <Card className="mb-6 text-center">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".docx,.pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
            <span className="text-body-md text-primary underline underline-offset-2">
              {isUploading ? "Parsing…" : "Choose a .docx or .pdf file"}
            </span>
          </label>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            or{" "}
            <button onClick={addBlankQuestion} className="text-primary underline underline-offset-2">
              start with a blank question
            </button>
          </p>
        </Card>
      )}

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      {committed && (
        <Card className="mb-6 flex items-center justify-between border-secondary bg-secondary-container/20">
          <p className="text-body-md text-on-secondary-container">
            Question set saved and approved — ready to start or schedule from the coordinator list.
          </p>
          <Button variant="secondary" onClick={() => router.push("/coordinator")}>
            Back to coordinator
          </Button>
        </Card>
      )}

      {questions.length > 0 && (
        <>
          <div className="flex flex-col gap-4">
            {questions.map((q, i) => (
              <QuestionReviewCard
                key={i}
                question={q}
                onChange={(updated) => updateQuestion(i, updated)}
                onRemove={() => removeQuestion(i)}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button variant="secondary" onClick={addBlankQuestion}>
              + Add question
            </Button>
            <Button onClick={handleCommit} disabled={isCommitting}>
              {isCommitting ? "Saving…" : `Commit ${questions.length} questions`}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
