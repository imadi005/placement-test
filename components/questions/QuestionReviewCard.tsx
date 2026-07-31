"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CodingProblemEditor } from "./CodingProblemEditor";
import { defaultCodingProblem, EditableCodingProblem } from "./coding-types";

export interface EditableOption {
  optionText: string;
  isCorrect: boolean;
}

export interface EditableQuestion {
  questionText: string;
  questionOrder: number;
  questionType: string; // "mcq" | "coding"
  options: EditableOption[];
  parseWarning?: string | null;
  codingProblem?: EditableCodingProblem;
}

interface Props {
  question: EditableQuestion;
  onChange: (updated: EditableQuestion) => void;
  onRemove: () => void;
}

// One row per parsed/manual question on the review screen. Every field is
// editable inline — this is the human-review gate from design doc §10,
// nothing here reaches a live test until the coordinator commits it.
export function QuestionReviewCard({ question, onChange, onRemove }: Props) {
  function updateOption(index: number, patch: Partial<EditableOption>) {
    const options = question.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ ...question, options });
  }

  function markCorrect(index: number) {
    const options = question.options.map((o, i) => ({ ...o, isCorrect: i === index }));
    onChange({ ...question, options });
  }

  function setQuestionType(questionType: string) {
    if (questionType === "coding") {
      onChange({ ...question, questionType, codingProblem: question.codingProblem ?? defaultCodingProblem() });
    } else {
      onChange({ ...question, questionType });
    }
  }

  return (
    <Card className={question.parseWarning ? "border-tertiary" : undefined}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-label-caps text-on-surface-variant">Question {question.questionOrder} ·</span>
          <select
            value={question.questionType}
            onChange={(e) => setQuestionType(e.target.value)}
            className="rounded border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 text-label-caps text-on-surface-variant"
          >
            <option value="mcq">MCQ</option>
            <option value="coding">CODING</option>
          </select>
        </div>
        <button onClick={onRemove} className="text-body-sm text-error underline underline-offset-2">
          Remove
        </button>
      </div>

      {question.parseWarning && (
        <div className="mb-3">
          <Badge tone="gold">{question.parseWarning}</Badge>
        </div>
      )}

      <textarea
        value={question.questionText}
        onChange={(e) => onChange({ ...question, questionText: e.target.value })}
        rows={question.questionType === "coding" ? 4 : 2}
        className="mb-4 w-full rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
        placeholder={question.questionType === "coding" ? "Problem statement" : "Question text"}
      />

      {question.questionType === "coding" ? (
        <CodingProblemEditor
          problem={question.codingProblem ?? defaultCodingProblem()}
          onChange={(codingProblem) => onChange({ ...question, codingProblem })}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {question.options.map((option, i) => (
            <div key={i} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => markCorrect(i)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-body-sm transition-colors ${
                  option.isCorrect
                    ? "border-secondary bg-secondary-container text-on-secondary-container"
                    : "border-outline-variant text-on-surface-variant hover:border-secondary/50"
                }`}
                title="Mark as correct answer"
              >
                {String.fromCharCode(65 + i)}
              </button>
              <input
                value={option.optionText}
                onChange={(e) => updateOption(i, { optionText: e.target.value })}
                className="flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
