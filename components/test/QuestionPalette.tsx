import { Card } from "@/components/ui/Card";

export type QuestionStatus = "answered" | "marked" | "not_answered" | "not_visited";

interface QuestionPaletteProps {
  total: number;
  currentIndex: number;
  statusFor: (index: number) => QuestionStatus;
  onJump: (index: number) => void;
  // Parallel to the question list — one section label per question, or
  // undefined/all-null for a plain single-section test (the vast majority),
  // which renders exactly the flat grid this component always has.
  sectionNames?: (string | null)[];
}

const STATUS_CLASSES: Record<QuestionStatus, string> = {
  answered: "bg-secondary text-on-primary hover:opacity-90",
  marked: "bg-violet-500 text-white hover:opacity-90",
  not_answered: "bg-error text-on-error hover:opacity-90",
  not_visited: "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high/80",
};

const LEGEND: { status: QuestionStatus; label: string }[] = [
  { status: "answered", label: "Answered" },
  { status: "not_answered", label: "Not answered" },
  { status: "not_visited", label: "Not visited" },
  { status: "marked", label: "Marked for review" },
];

function QuestionButton({
  index,
  status,
  isCurrent,
  onJump,
}: {
  index: number;
  status: QuestionStatus;
  isCurrent: boolean;
  onJump: (index: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(index)}
      className={`flex h-9 w-9 items-center justify-center rounded-md text-body-sm font-medium transition-all ${STATUS_CLASSES[status]} ${
        isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : ""
      }`}
    >
      {index + 1}
    </button>
  );
}

// The exam-portal "question palette" — every question as a clickable,
// color-coded number so a student can jump straight to any question instead
// of only stepping through with Previous/Next. Groups by section (if the
// test has any) purely for navigation — there's still one timer for the
// whole test, sections don't lock or gate each other.
export function QuestionPalette({ total, currentIndex, statusFor, onJump, sectionNames }: QuestionPaletteProps) {
  const hasSections = sectionNames?.some((s) => s);

  return (
    <Card className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      <p className="text-label-caps text-on-surface-variant">Questions</p>

      {hasSections ? (
        <div className="flex flex-col gap-4">
          {(() => {
            // Per-attempt anti-cheat shuffling (attempts.service.ts) reorders
            // questions, so same-named sections are rarely still contiguous —
            // bucket by name instead of merging only consecutive runs, or a
            // shuffled attempt would show the same section header repeated
            // with single-question groups scattered throughout.
            const groups: { name: string; indices: number[] }[] = [];
            for (let i = 0; i < total; i++) {
              const name = sectionNames![i] || "General";
              const existing = groups.find((g) => g.name === name);
              if (existing) existing.indices.push(i);
              else groups.push({ name, indices: [i] });
            }
            return groups.map((group) => (
              <div key={`${group.name}-${group.indices[0]}`} className="flex flex-col gap-2">
                <p className="text-label-caps text-on-surface-variant">{group.name}</p>
                <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
                  {group.indices.map((i) => (
                    <QuestionButton key={i} index={i} status={statusFor(i)} isCurrent={i === currentIndex} onJump={onJump} />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
          {Array.from({ length: total }, (_, i) => (
            <QuestionButton key={i} index={i} status={statusFor(i)} isCurrent={i === currentIndex} onJump={onJump} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {LEGEND.map(({ status, label }) => (
          <div key={status} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className={`h-3 w-3 rounded-sm ${STATUS_CLASSES[status].split(" ")[0]}`} />
            {label}
          </div>
        ))}
      </div>
    </Card>
  );
}
