"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

interface Props {
  total: number;
  answered: number;
  notAnswered: number;
  marked: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Second confirmation gate before the real, irreversible submit — shows the
// same counts the question palette is colored by, so a student can't submit
// without seeing "3 not answered" first.
export function SubmitConfirmModal({ total, answered, notAnswered, marked, isSubmitting, onCancel, onConfirm }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-on-surface/50 px-4 py-8 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm animate-fade-in-up rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-soft-ink-lg">
        <h2 className="font-serif text-headline-md text-on-surface">Submit test?</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Once submitted, you won&apos;t be able to change any answers.
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-body-sm">
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Total questions</dt>
            <dd className="font-medium text-on-surface">{total}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Answered</dt>
            <dd className="font-medium text-on-surface">{answered}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Not answered</dt>
            <dd className="font-medium text-error">{notAnswered}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Marked for review</dt>
            <dd className="font-medium text-on-surface">{marked}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Yes, submit"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
