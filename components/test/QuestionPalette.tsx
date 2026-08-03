import { Card } from "@/components/ui/Card";

export type QuestionStatus = "answered" | "marked" | "not_answered" | "not_visited";

interface QuestionPaletteProps {
  total: number;
  currentIndex: number;
  statusFor: (index: number) => QuestionStatus;
  onJump: (index: number) => void;
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

// The exam-portal "question palette" — every question as a clickable,
// color-coded number so a student can jump straight to any question instead
// of only stepping through with Previous/Next.
export function QuestionPalette({ total, currentIndex, statusFor, onJump }: QuestionPaletteProps) {
  return (
    <Card className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      <p className="text-label-caps text-on-surface-variant">Questions</p>
      <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
        {Array.from({ length: total }, (_, i) => {
          const status = statusFor(i);
          const isCurrent = i === currentIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-body-sm font-medium transition-all ${STATUS_CLASSES[status]} ${
                isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : ""
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
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
