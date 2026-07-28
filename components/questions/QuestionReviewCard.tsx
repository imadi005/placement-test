"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface EditableOption {
  optionText: string;
  isCorrect: boolean;
}

export interface EditableQuestion {
  questionText: string;
  questionOrder: number;
  questionType: string;
  options: EditableOption[];
  modelAnswer?: string | null;
  rubricNotes?: string | null;
  parseWarning?: string | null;
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

  return (
    <Card className={question.parseWarning ? "border-tertiary" : undefined}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <span className="text-label-caps text-on-surface-variant">
          Question {question.questionOrder} · {question.questionType.toUpperCase()}
        </span>
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
        rows={2}
        className="mb-4 w-full rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface focus:border-primary"
        placeholder="Question text"
      />

      {question.questionType === "mcq" ? (
        <div className="flex flex-col gap-2">
          {question.options.map((option, i) => (
            <div key={i} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => markCorrect(i)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-body-sm ${
                  option.isCorrect
                    ? "border-secondary bg-secondary-container text-on-secondary-container"
                    : "border-outline-variant text-on-surface-variant"
                }`}
                title="Mark as correct answer"
              >
                {String.fromCharCode(65 + i)}
              </button>
              <input
                value={option.optionText}
                onChange={(e) => updateOption(i, { optionText: e.target.value })}
                className="flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface focus:border-primary"
              />
            </div>
          ))}
        </div>
      ) : (
        <textarea
          value={question.modelAnswer ?? ""}
          onChange={(e) => onChange({ ...question, modelAnswer: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-sm text-on-surface focus:border-primary"
          placeholder="Model answer / rubric notes for the grader"
        />
      )}
    </Card>
  );
}
