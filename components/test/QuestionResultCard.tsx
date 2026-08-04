"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface OptionView {
  id: string;
  optionText: string;
  isCorrect: boolean;
}

export interface ResultAnswer {
  id: string;
  question: {
    questionText: string;
    marks: string;
    questionType: string;
    options: OptionView[];
  };
  selectedOptionId: string | null;
  marksAwarded: string | null;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One collapsible card per question — click the header to expand the full
// option-by-option breakdown (correct answer in green, a wrong pick in red)
// underneath. Used on both the post-submit results page and the dashboard's
// test-history view (same underlying data, same component).
export function QuestionResultCard({ answer, index }: { answer: ResultAnswer; index: number }) {
  const [open, setOpen] = useState(false);
  const { question } = answer;
  const isCoding = question.questionType === "coding";
  const marksAwarded = Number(answer.marksAwarded ?? 0);
  const maxMarks = Number(question.marks);
  const isCorrect = marksAwarded >= maxMarks && maxMarks > 0;
  const selectedOption = question.options.find((o) => o.id === answer.selectedOptionId);
  const correctOption = question.options.find((o) => o.isCorrect);

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Chevron open={open} />
          <p className="truncate text-body-md text-on-surface">
            <span className="text-on-surface-variant">Q{index + 1}.</span> {question.questionText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isCoding && (
            <Badge tone={isCorrect ? "sage" : "crimson"}>{isCorrect ? "Correct" : "Incorrect"}</Badge>
          )}
          <span className="font-serif font-semibold text-on-surface">
            {marksAwarded}/{maxMarks}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-outline-variant p-4">
          {isCoding ? (
            <p className="text-body-sm text-on-surface-variant">
              Graded against test cases — {marksAwarded}/{maxMarks} marks.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {question.options.map((o) => {
                const isSelected = o.id === answer.selectedOptionId;
                const tone = o.isCorrect ? "correct" : isSelected ? "wrong" : "neutral";
                return (
                  <div
                    key={o.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-body-sm ${
                      tone === "correct"
                        ? "border-secondary bg-secondary-container text-on-secondary-container"
                        : tone === "wrong"
                          ? "border-error bg-error-container text-on-error-container"
                          : "border-outline-variant bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    <span>{o.optionText}</span>
                    <span className="text-label-caps">
                      {o.isCorrect ? "Correct answer" : isSelected ? "Your answer" : ""}
                    </span>
                  </div>
                );
              })}
              {!selectedOption && (
                <p className="text-body-sm text-on-surface-variant">You didn&apos;t answer this question.</p>
              )}
              {!correctOption && (
                <p className="text-body-sm text-on-surface-variant">
                  (No correct option was marked for this question.)
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
