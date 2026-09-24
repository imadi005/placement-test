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
// table is authored as pipe-delimited rows (see question-extraction.service.ts).
// Uploaded .docx files put every line in its own Word paragraph, and
// mammoth's extraction (docx-parser.service.ts) inserts a blank line between
// EVERY paragraph on the way out — so a real table's rows end up with blank
// lines between them too, not just between the prose intro and the table.
// Grouping by blank lines alone would treat each row as its own 1-line
// "block" and never detect a table. Instead, drop blank lines entirely and
// group consecutive lines by whether they look like a table row ("|") —
// a run of pipe-lines (however many blank lines separated them originally)
// becomes one table; a run of prose lines renders as individual paragraphs.
function ReferenceMaterial({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const segments: { type: "table" | "prose"; lines: string[] }[] = [];
  for (const line of lines) {
    const type = line.includes("|") ? "table" : "prose";
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.lines.push(line);
    else segments.push({ type, lines: [line] });
  }

  return (
    <div className="mt-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
      <p className="mb-2 text-label-caps text-on-surface-variant">Reference material</p>
      <div className="flex flex-col gap-4">
        {segments.map((segment, i) => {
          if (segment.type === "prose") {
            return (
              <div key={i} className="flex flex-col gap-2">
                {segment.lines.map((line, li) => (
                  <p key={li} className="text-body-sm text-on-surface">
                    {line}
                  </p>
                ))}
              </div>
            );
          }

          const rows = segment.lines.map((l) => l.split("|").map((cell) => cell.trim()));
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
