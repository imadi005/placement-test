"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TestHeader } from "@/components/test/TestHeader";
import { QuestionCard, Option } from "@/components/test/QuestionCard";
import { Button } from "@/components/ui/Button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;

interface BackendQuestion {
  id: string;
  questionText: string;
  questionOrder: number;
  marks: string;
  questionType: string;
  options: { id: string; optionText: string }[];
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function LiveTestPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BackendQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> selected optionId (mcq)
  const [freeTextAnswers, setFreeTextAnswers] = useState<Record<string, string>>({}); // questionId -> text (non-mcq)
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const durationSecondsRef = useRef(0);
  const freeTextSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Design doc §5: attempt is created (or resumed) on join. The server
  // returns `serverStartedAt` + the test's duration — the client countdown
  // is derived from that, never from a locally-invented value.
  useEffect(() => {
    async function startAttempt() {
      try {
        const res = await fetch(`${API_URL}/tests/${testId}/attempts/start`, {
          method: "POST",
          headers: authHeaders(),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setLoadError(body?.message ?? "Couldn't start this test. It may not be live yet.");
          return;
        }
        const data = await res.json();
        setAttemptId(data.attempt.id);
        setQuestions(data.questions);

        const existing: { questionId: string; selectedOptionId: string | null; freeTextAnswer: string | null }[] =
          data.existingAnswers ?? [];
        if (existing.length > 0) {
          const restoredOptions: Record<string, string> = {};
          const restoredFreeText: Record<string, string> = {};
          for (const a of existing) {
            if (a.selectedOptionId) restoredOptions[a.questionId] = a.selectedOptionId;
            if (a.freeTextAnswer) restoredFreeText[a.questionId] = a.freeTextAnswer;
          }
          setAnswers(restoredOptions);
          setFreeTextAnswers(restoredFreeText);
        }

        const durationMinutes = data.attempt.durationMinutes ?? 40;
        durationSecondsRef.current = durationMinutes * 60;
        const startedAt = new Date(data.serverStartedAt).getTime();
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSecondsLeft(Math.max(0, durationSecondsRef.current - elapsed));

        if (data.questions.length === 0) {
          setLoadError("This test has no questions yet — ask your coordinator to upload/commit a question set before starting it.");
        }
      } catch {
        setLoadError("Couldn't reach the server. Is the backend running?");
      }
    }
    startAttempt();
  }, [testId]);

  useEffect(() => {
    if (!attemptId) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          handleSubmit("timeout");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function reportViolation(type: string) {
    if (!attemptId) return;
    try {
      const res = await fetch(`${API_URL}/attempts/${attemptId}/violations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      setViolationCount(data.violationCount ?? 0);
      if (data.autoSubmitted) {
        router.push(`/results/${attemptId}`);
      }
    } catch {
      // Network hiccup on a violation report shouldn't crash the exam —
      // the count just won't increment for this one event.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  function requestFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    if (!attemptId) return;
    try {
      await fetch(`${API_URL}/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ questionId, selectedOptionId: optionId }),
      });
    } catch {
      // Autosave failure on one question shouldn't block navigation —
      // consider surfacing a subtle "not saved" indicator in a later pass.
    }
  }

  function setFreeTextAnswer(questionId: string, text: string) {
    setFreeTextAnswers((prev) => ({ ...prev, [questionId]: text }));
    if (!attemptId) return;

    // Debounced — a network call per keystroke would be wasteful and race
    // against itself; save 800ms after the student stops typing.
    clearTimeout(freeTextSaveTimers.current[questionId]);
    freeTextSaveTimers.current[questionId] = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ questionId, freeTextAnswer: text }),
        });
      } catch {
        // A dropped autosave shouldn't block typing.
      }
    }, 800);
  }

  async function handleSubmit(reason: "manual" | "timeout" = "manual") {
    if (!attemptId) return;
    try {
      // Flush any free-text answers still waiting on their debounce timer so
      // the last few keystrokes before submit aren't lost.
      const pending = Object.entries(freeTextSaveTimers.current);
      for (const [questionId, timer] of pending) {
        clearTimeout(timer);
        await fetch(`${API_URL}/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ questionId, freeTextAnswer: freeTextAnswers[questionId] ?? "" }),
        }).catch(() => {});
      }

      await fetch(`${API_URL}/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: authHeaders(),
      });
    } finally {
      router.push(`/results/${attemptId}`);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-body-md text-error">{loadError}</p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading test…</p>
      </main>
    );
  }

  const question = questions[currentIndex];
  const isLowTime = secondsLeft <= LOW_TIME_THRESHOLD_SECONDS;
  const options: Option[] = question.options.map((o, i) => ({
    id: o.id,
    label: String.fromCharCode(65 + i),
    text: o.optionText,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-test-column px-4 pb-24">
      <TestHeader
        currentQuestion={currentIndex + 1}
        totalQuestions={questions.length}
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
          topic={`Question ${question.questionOrder}`}
          questionText={question.questionText}
          questionType={question.questionType}
          options={options}
          selectedOptionId={answers[question.id] ?? null}
          onSelect={(optionId) => selectOption(question.id, optionId)}
          freeTextValue={freeTextAnswers[question.id] ?? ""}
          onFreeTextChange={(text) => setFreeTextAnswer(question.id, text)}
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
          {currentIndex === questions.length - 1 ? (
            <Button variant="primary" onClick={() => handleSubmit("manual")}>
              Submit test
            </Button>
          ) : (
            <Button onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}>
              Save & next →
            </Button>
          )}
        </div>
        <p className="pb-3 text-center text-label-caps text-on-surface-variant">
          Exam environment · {violationCount} flagged event{violationCount === 1 ? "" : "s"}
        </p>
      </div>
    </main>
  );
}
