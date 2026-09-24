"use client";

import clsx from "clsx";

export interface Option {
  id: string;
  label: string;
  text: string;
}

interface QuestionCardProps {
  topic: string;
  questionText: string;
  options: Option[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  // A shared data table or reading passage this question (and often several
  // around it) refers to — absent for every question that stands alone.
  contextText?: string | null;
}

// contextText comes from the upload convention as plain text — a data
// table is authored as pipe-delimited rows (see question-extraction.service.ts),
// everything else is prose. Split into blocks on blank lines and render each
// pipe-delimited block as a real <table> instead of dumping raw "|" text.
function ReferenceMaterial({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  return (
    <div className="mt-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
      <p className="mb-2 text-label-caps text-on-surface-variant">Reference material</p>
      <div className="flex flex-col gap-4">
        {blocks.map((block, i) => {
          const lines = block.split("\n").filter((l) => l.trim());
          const isTable = lines.length > 1 && lines.every((l) => l.includes("|"));

          if (!isTable) {
            return (
              <p key={i} className="whitespace-pre-wrap text-body-sm text-on-surface">
                {block.trim()}
              </p>
            );
          }

          const rows = lines.map((l) => l.split("|").map((cell) => cell.trim()));
          const [header, ...body] = rows;

          return (
            <div key={i} className="overflow-x-auto rounded-md border border-outline-variant">
              <table className="w-full border-collapse text-body-sm">
                <thead>
                  <tr className="bg-surface-container-high">
                    {header.map((cell, ci) => (
                      <th
                        key={ci}
                        className="border-b border-outline-variant px-3 py-2 text-left font-medium text-on-surface"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? "bg-surface-container-lowest" : undefined}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border-b border-outline-variant/60 px-3 py-1.5 text-on-surface">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Every question is MCQ — no free-text/descriptive answer type to branch on.
export function QuestionCard({
  topic,
  questionText,
  options,
  selectedOptionId,
  onSelect,
  contextText,
}: QuestionCardProps) {
  return (
    <div>
      <p className="text-label-caps text-primary">{topic}</p>
      {contextText && <ReferenceMaterial text={contextText} />}
      <h1 className="mt-3 font-serif text-headline-md text-on-surface">{questionText}</h1>

      <div role="radiogroup" aria-label="Answer options" className="mt-8 flex flex-col gap-3">
        {options.map((option, i) => {
          const isSelected = option.id === selectedOptionId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.id)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={clsx(
                "flex animate-fade-in-up items-center gap-4 rounded-md border p-3.5 text-left transition-all duration-200 ease-smooth active:scale-[0.99]",
                isSelected
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-outline-variant bg-surface-container-lowest hover:border-outline hover:bg-surface-container-low"
              )}
            >
              <span
                className={clsx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-body-sm transition-colors",
                  isSelected ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"
                )}
              >
                {option.label}
              </span>
              <span className="text-body-md text-on-surface">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
