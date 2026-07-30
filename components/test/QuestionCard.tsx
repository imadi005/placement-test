"use client";

import { useState } from "react";
import clsx from "clsx";

export interface Option {
  id: string;
  label: string;
  text: string;
}

interface QuestionCardProps {
  topic: string;
  questionText: string;
  questionType: string;
  options: Option[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  freeTextValue: string;
  onFreeTextChange: (value: string) => void;
}

export function QuestionCard({
  topic,
  questionText,
  questionType,
  options,
  selectedOptionId,
  onSelect,
  freeTextValue,
  onFreeTextChange,
}: QuestionCardProps) {
  return (
    <div>
      <p className="text-label-caps text-primary">{topic}</p>
      <h1 className="mt-3 font-serif text-headline-md text-on-surface">{questionText}</h1>

      {questionType === "mcq" ? (
        <div role="radiogroup" aria-label="Answer options" className="mt-8 flex flex-col gap-3">
          {options.map((option) => {
            const isSelected = option.id === selectedOptionId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(option.id)}
                className={clsx(
                  "flex items-center gap-4 rounded-md border p-3 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant bg-surface-container-lowest hover:border-outline"
                )}
              >
                <span
                  className={clsx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-body-sm",
                    isSelected ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"
                  )}
                >
                  {option.label}
                </span>
                <span className="text-body-md text-on-surface">{option.text}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          value={freeTextValue}
          onChange={(e) => onFreeTextChange(e.target.value)}
          rows={8}
          aria-label="Your answer"
          placeholder="Type your answer here…"
          className="mt-8 w-full rounded-md border border-outline-variant bg-surface-container-lowest p-4 text-body-md text-on-surface focus:border-primary"
        />
      )}
    </div>
  );
}
