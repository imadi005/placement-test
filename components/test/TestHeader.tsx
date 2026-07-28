interface TestHeaderProps {
  currentQuestion: number;
  totalQuestions: number;
  timeRemainingLabel: string;
  isLowTime: boolean;
}

// Kept deliberately outside the main <main> distraction-free column so it can
// stay pinned while the question content scrolls. The timer background flips
// to the error tone once `isLowTime` is true — don't rely on color alone,
// the label itself should also change (see LiveTestScreen).
export function TestHeader({
  currentQuestion,
  totalQuestions,
  timeRemainingLabel,
  isLowTime,
}: TestHeaderProps) {
  const progressPercent = (currentQuestion / totalQuestions) * 100;

  return (
    <header className="sticky top-0 z-10 bg-background">
      <div className="mx-auto flex max-w-test-column items-center justify-between px-4 py-4">
        <span className="text-label-caps text-on-surface-variant">
          Question {currentQuestion} of {totalQuestions}
        </span>
        <div
          className={`flex items-center gap-2 rounded-md px-4 py-2 font-serif text-xl font-semibold ${
            isLowTime ? "bg-error text-on-error" : "bg-primary text-on-primary"
          }`}
          role="timer"
          aria-live="polite"
        >
          {timeRemainingLabel}
        </div>
      </div>
      <div className="h-1 w-full bg-surface-container-high">
        <div
          className="h-1 bg-primary transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </header>
  );
}
