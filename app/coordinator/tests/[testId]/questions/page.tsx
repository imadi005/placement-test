"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { QuestionReviewCard, EditableQuestion } from "@/components/questions/QuestionReviewCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(json = true) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export default function QuestionReviewPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);

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

      setCommitted(true);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6">
        <h1 className="font-serif text-headline-md text-on-surface">Question bank review</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Upload a .docx/.pdf question set, fix anything the parser flagged, then commit before
          scheduling this test.
        </p>
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
        <Card className="mb-6 border-secondary bg-secondary-container/20 text-center">
          <p className="text-body-md text-on-secondary-container">
            Question set saved. This test can now be scheduled once approved.
          </p>
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
