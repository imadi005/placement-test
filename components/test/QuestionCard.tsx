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
}

// Every question is MCQ — no free-text/descriptive answer type to branch on.
export function QuestionCard({ topic, questionText, options, selectedOptionId, onSelect }: QuestionCardProps) {
  return (
    <div>
      <p className="text-label-caps text-primary">{topic}</p>
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
