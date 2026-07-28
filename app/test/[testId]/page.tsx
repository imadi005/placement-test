"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { TestHeader } from "@/components/test/TestHeader";
import { QuestionCard, Option } from "@/components/test/QuestionCard";
import { Button } from "@/components/ui/Button";

// Placeholder — replace with a fetch to GET /tests/:id/attempt on mount.
const QUESTIONS: { topic: string; text: string; options: Option[] }[] = [
  {
    topic: "Mathematics · Logic",
    text: "If a sequence is defined so each term is the sum of the two preceding terms, and the first two terms are 3 and 5, what is the 6th term?",
    options: [
      { id: "a", label: "A", text: "21" },
      { id: "b", label: "B", text: "34" },
      { id: "c", label: "C", text: "48" },
      { id: "d", label: "D", text: "55" },
    ],
  },
];

const TEST_DURATION_SECONDS = 40 * 60;
const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;
const MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveTestPage() {
  const params = useParams();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(TEST_DURATION_SECONDS);
  const [violationCount, setViolationCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const violationCountRef = useRef(0);

  const question = QUESTIONS[currentIndex];

  // Server-authoritative timer note: this client countdown is for display
  // only. The real deadline must be enforced by the NestJS backend (via the
  // Redis-held `attempt:{id}:state`) — never trust this clock for scoring.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Report a violation to the backend — wire this to
  // `socket.emit("test:violation", { attemptId, type, meta })` once the
  // gateway is connected.
  function reportViolation(type: string) {
    violationCountRef.current += 1;
    setViolationCount(violationCountRef.current);
    if (violationCountRef.current >= MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT) {
      handleAutoSubmit();
    }
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) reportViolation("tab_switch");
    }
    function handleFullscreenChange() {
      const fsActive = Boolean(document.fullscreenElement);
      setIsFullscreen(fsActive);
      if (!fsActive) reportViolation("fullscreen_exit");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  function requestFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Fullscreen can be denied by the browser/user — surface this as a
      // banner state rather than failing silently (see the JSX below).
    });
  }

  function handleAutoSubmit() {
    // TODO: POST /attempts/:id/submit with reason: "violation_threshold"
  }

  const isLowTime = secondsLeft <= LOW_TIME_THRESHOLD_SECONDS;

  return (
    <main className="mx-auto min-h-screen max-w-test-column px-4 pb-24">
      <TestHeader
        currentQuestion={currentIndex + 1}
        totalQuestions={QUESTIONS.length}
        timeRemainingLabel={formatTime(secondsLeft)}
        isLowTime={isLowTime}
      />

      {!isFullscreen && (
        <div className="my-4 flex items-center justify-between rounded-md border border-tertiary-container bg-tertiary-container/10 px-4 py-3">
          <span className="text-body-sm text-on-surface">
            Fullscreen is required during the assessment.
          </span>
          <Button size="md" onClick={requestFullscreen}>
            Enter fullscreen
          </Button>
        </div>
      )}

      <div className="mt-6">
        <QuestionCard
          topic={question.topic}
          questionText={question.text}
          options={question.options}
          selectedOptionId={answers[currentIndex] ?? null}
          onSelect={(optionId) =>
            setAnswers((prev) => ({ ...prev, [currentIndex]: optionId }))
          }
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-outline-variant bg-background">
        <div className="mx-auto flex max-w-test-column items-center justify-between px-4 py-4">
          <Button
            variant="ghost"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            ← Previous
          </Button>
          <Button onClick={() => setCurrentIndex((i) => Math.min(QUESTIONS.length - 1, i + 1))}>
            Save & next →
          </Button>
        </div>
        <p className="pb-3 text-center text-label-caps text-on-surface-variant">
          Exam environment · {violationCount} flagged event{violationCount === 1 ? "" : "s"}
        </p>
      </div>
    </main>
  );
}
