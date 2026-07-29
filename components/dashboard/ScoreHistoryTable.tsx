"use client";

import { Fragment, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

export interface ScoreRow {
  attemptId: string;
  testName: string;
  dateCompleted: string;
  score: string;
  status: "graded" | "pending_grading";
}

interface AttemptOption {
  id: string;
  optionText: string;
  isCorrect: boolean;
}
interface AttemptAnswer {
  id: string;
  freeTextAnswer: string | null;
  marksAwarded: string | null;
  selectedOption: AttemptOption | null;
  question: {
    questionText: string;
    questionType: string;
    marks: string;
    modelAnswer: string | null;
    options: AttemptOption[];
  };
}
interface AttemptDetail {
  id: string;
  answers: AttemptAnswer[];
}

// Chevron rotates open/closed — pure CSS, no animation library needed for
// something this simple.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnswerBreakdown({ answer }: { answer: AttemptAnswer }) {
  const { question } = answer;
  const isMcq = question.questionType === "mcq";

  if (isMcq) {
    const isCorrect = Boolean(answer.selectedOption?.isCorrect);
    const correctOption = question.options.find((o) => o.isCorrect);
    return (
      <div className="border-b border-outline-variant py-4 last:border-0">
        <div className="mb-2 flex items-start justify-between gap-4">
          <p className="text-body-md text-on-surface">{question.questionText}</p>
          <Badge tone={isCorrect ? "sage" : "crimson"} className="shrink-0">
            {isCorrect ? "Correct" : "Incorrect"}
          </Badge>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          Your answer:{" "}
          <span className={isCorrect ? "text-on-surface" : "font-medium text-error"}>
            {answer.selectedOption?.optionText ?? "Not answered"}
          </span>
        </p>
        {!isCorrect && correctOption && (
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Correct answer: <span className="font-medium text-on-surface">{correctOption.optionText}</span>
          </p>
        )}
      </div>
    );
  }

  const isGraded = answer.marksAwarded !== null;
  return (
    <div className="border-b border-outline-variant py-4 last:border-0">
      <div className="mb-2 flex items-start justify-between gap-4">
        <p className="text-body-md text-on-surface">{question.questionText}</p>
        {isGraded ? (
          <Badge tone="sage" className="shrink-0">
            {answer.marksAwarded}/{question.marks}
          </Badge>
        ) : (
          <Badge tone="gold" className="shrink-0">
            Pending grading
          </Badge>
        )}
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Your answer: <span className="text-on-surface">{answer.freeTextAnswer || "Not answered"}</span>
      </p>
      {question.modelAnswer && (
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Model answer: <span className="text-on-surface">{question.modelAnswer}</span>
        </p>
      )}
    </div>
  );
}

export function ScoreHistoryTable({ rows }: { rows: ScoreRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AttemptDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function toggleRow(attemptId: string) {
    if (expandedId === attemptId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(attemptId);
    if (details[attemptId]) return;

    setLoadingId(attemptId);
    setErrorId(null);
    try {
      const res = await fetch(`${API_URL}/attempts/${attemptId}/result`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data: AttemptDetail = await res.json();
      setDetails((prev) => ({ ...prev, [attemptId]: data }));
    } catch {
      setErrorId(attemptId);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Card className="p-0">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="p-4 text-label-caps text-on-surface-variant">Test module</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Date completed</th>
            <th className="p-4 text-label-caps text-on-surface-variant">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expandedId === row.attemptId;
            return (
              <Fragment key={row.attemptId}>
                <tr
                  onClick={() => toggleRow(row.attemptId)}
                  className="cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                >
                  <td className="min-h-14 p-4 text-body-md text-on-surface">
                    <div className="flex items-center gap-2">
                      <Chevron open={isOpen} />
                      {row.testName}
                    </div>
                  </td>
                  <td className="p-4 text-body-sm text-on-surface-variant">{row.dateCompleted}</td>
                  <td className="p-4">
                    {row.status === "pending_grading" ? (
                      <Badge tone="gold">Pending grading</Badge>
                    ) : (
                      <span className="font-serif font-semibold text-on-surface">{row.score}</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-outline-variant last:border-0">
                    <td colSpan={3} className="bg-surface-container-low px-4 pb-2">
                      {loadingId === row.attemptId && (
                        <p className="py-4 text-body-sm text-on-surface-variant">Loading your answers…</p>
                      )}
                      {errorId === row.attemptId && (
                        <p className="py-4 text-body-sm text-error">Couldn't load this attempt's answers.</p>
                      )}
                      {details[row.attemptId] && (
                        <div>
                          {details[row.attemptId].answers.map((a) => (
                            <AnswerBreakdown key={a.id} answer={a} />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
