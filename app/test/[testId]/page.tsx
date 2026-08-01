"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TestHeader } from "@/components/test/TestHeader";
import { QuestionCard, Option } from "@/components/test/QuestionCard";
import { CodingQuestionCard, CodingProblemView } from "@/components/test/CodingQuestionCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;
const JSON_HEADERS = { "Content-Type": "application/json" };

interface BackendQuestion {
  id: string;
  questionText: string;
  questionOrder: number;
  marks: string;
  questionType: string;
  options: { id: string; optionText: string }[];
  codingProblem: CodingProblemView | null;
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveTestPage() {
  const ready = useAuthGuard(["student"]);
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  // Gated behind an explicit click — browsers only grant the Fullscreen API
  // a transient user gesture, never a plain useEffect-on-mount call, so the
  // click that starts the attempt is also the one that requests fullscreen.
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BackendQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> selected optionId
  const [codeAnswers, setCodeAnswers] = useState<Record<string, { code: string; language: string }>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const durationSecondsRef = useRef(0);
  const codeSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Set right before OUR OWN exitFullscreen() call (submit/auto-submit) so
  // the fullscreenchange listener below can tell "we just ended the exam"
  // apart from "the student actually escaped fullscreen" — only the latter
  // is a violation.
  const expectedExitRef = useRef(false);

  // Design doc §5: attempt is created (or resumed) on join. The server
  // returns `serverStartedAt` + the test's duration — the client countdown
  // is derived from that, never from a locally-invented value.
  async function startAttempt() {
    setIsStarting(true);
    try {
      const res = await authFetch(`${API_URL}/tests/${testId}/attempts/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setLoadError(body?.message ?? "Couldn't start this test. It may not be live yet.");
        return;
      }
      const data = await res.json();
      setAttemptId(data.attempt.id);
      const loadedQuestions: BackendQuestion[] = data.questions;
      setQuestions(loadedQuestions);

      const existing: {
        questionId: string;
        selectedOptionId: string | null;
        submittedCode: string | null;
        codeLanguage: string | null;
      }[] = data.existingAnswers ?? [];
      const restoredOptions: Record<string, string> = {};
      const restoredCode: Record<string, { code: string; language: string }> = {};
      for (const a of existing) {
        if (a.selectedOptionId) restoredOptions[a.questionId] = a.selectedOptionId;
        if (a.submittedCode && a.codeLanguage) {
          restoredCode[a.questionId] = { code: a.submittedCode, language: a.codeLanguage };
        }
      }
      // Every coding question starts with a blank editor — never
      // pre-filled with the coordinator's starter code (which, until a
      // real judge is wired up in phase 2, has no guarantee of being mere
      // scaffolding rather than the actual solution) — unless the student
      // already has a saved draft for it.
      for (const q of loadedQuestions) {
        if (q.questionType === "coding" && q.codingProblem && !restoredCode[q.id]) {
          const language = q.codingProblem.allowedLanguages[0] ?? "python";
          restoredCode[q.id] = { code: "", language };
        }
      }
      setAnswers(restoredOptions);
      setCodeAnswers(restoredCode);

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
    } finally {
      setIsStarting(false);
    }
  }

  // The one click that both enters fullscreen and starts the attempt —
  // requestFullscreen() must run synchronously in this handler, before any
  // `await`, or the browser silently ignores it for lacking user activation.
  function handleBeginTest() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
    startAttempt();
  }

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

  // Exits fullscreen (if we're in it) and navigates — the one place both
  // the manual/timeout submit path and the auto-submit-on-violation path
  // leave the exam, so fullscreen never lingers after it's actually over.
  async function exitFullscreenAndGo(path: string) {
    expectedExitRef.current = true;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    router.push(path);
  }

  async function reportViolation(type: string) {
    if (!attemptId) return;
    try {
      const res = await authFetch(`${API_URL}/attempts/${attemptId}/violations`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.autoSubmitted) {
        await exitFullscreenAndGo(`/results/${attemptId}`);
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
      if (!fsActive) {
        if (expectedExitRef.current) {
          // Our own exitFullscreenAndGo() call — the exam already ended,
          // not a student escaping it.
          expectedExitRef.current = false;
          return;
        }
        reportViolation("fullscreen_exit");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    if (!attemptId) return;
    try {
      await authFetch(`${API_URL}/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ questionId, selectedOptionId: optionId }),
      });
    } catch {
      // Autosave failure on one question shouldn't block navigation —
      // consider surfacing a subtle "not saved" indicator in a later pass.
    }
  }

  function saveCodeAnswer(questionId: string, code: string, language: string) {
    if (!attemptId) return;
    // Debounced — a network call per keystroke would be wasteful and race
    // against itself; save 800ms after the student stops typing.
    clearTimeout(codeSaveTimers.current[questionId]);
    codeSaveTimers.current[questionId] = setTimeout(async () => {
      try {
        await authFetch(`${API_URL}/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ questionId, submittedCode: code, codeLanguage: language }),
        });
      } catch {
        // A dropped autosave shouldn't block typing.
      }
    }, 800);
  }

  function handleCodeChange(questionId: string, code: string) {
    setCodeAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], code } }));
    const language = codeAnswers[questionId]?.language ?? "python";
    saveCodeAnswer(questionId, code, language);
  }

  function handleLanguageChange(questionId: string, language: string) {
    setCodeAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], language } }));
    saveCodeAnswer(questionId, codeAnswers[questionId]?.code ?? "", language);
  }

  async function handleRunCode(questionId: string, sourceCode: string, language: string) {
    if (!attemptId) throw new Error("No attempt in progress");
    const res = await authFetch(`${API_URL}/attempts/${attemptId}/questions/${questionId}/run`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ sourceCode, language }),
    });
    if (!res.ok) throw new Error("Run failed");
    return res.json();
  }

  async function handleSubmit(reason: "manual" | "timeout" = "manual") {
    if (!attemptId) return;
    try {
      // Flush any code edits still waiting on their debounce timer so the
      // last few keystrokes before submit aren't lost.
      const pending = Object.entries(codeSaveTimers.current);
      for (const [questionId, timer] of pending) {
        clearTimeout(timer);
        const entry = codeAnswers[questionId];
        if (!entry) continue;
        await authFetch(`${API_URL}/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ questionId, submittedCode: entry.code, codeLanguage: entry.language }),
        }).catch(() => {});
      }

      await authFetch(`${API_URL}/attempts/${attemptId}/submit`, {
        method: "POST",
      });
    } finally {
      await exitFullscreenAndGo(`/results/${attemptId}`);
    }
  }

  if (!ready) return null;

  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm animate-fade-in-up text-center shadow-soft-ink-lg">
          <p className="text-label-caps text-primary">Placement Test Portal</p>
          <h1 className="mt-3 font-serif text-headline-md text-on-surface">Ready to begin?</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            This assessment runs in fullscreen. Leaving fullscreen or switching tabs during the
            test is logged as a violation.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={handleBeginTest} disabled={isStarting}>
            {isStarting ? "Starting…" : "Begin test"}
          </Button>
        </Card>
      </main>
    );
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
  const isCoding = question.questionType === "coding" && Boolean(question.codingProblem);
  const options: Option[] = question.options.map((o, i) => ({
    id: o.id,
    label: String.fromCharCode(65 + i),
    text: o.optionText,
  }));
  // Coding questions get a much wider column — an IDE-style split view
  // doesn't fit in the narrow single-question reading width MCQs use.
  const containerWidthClass = isCoding ? "max-w-6xl" : "max-w-test-column";

  return (
    <main className={`mx-auto min-h-screen ${containerWidthClass} px-4 pb-24`}>
      <TestHeader
        currentQuestion={currentIndex + 1}
        totalQuestions={questions.length}
        timeRemainingLabel={formatTime(secondsLeft)}
        isLowTime={isLowTime}
      />

      <div className="mt-6">
        {isCoding && question.codingProblem ? (
          <CodingQuestionCard
            topic={`Question ${question.questionOrder}`}
            questionText={question.questionText}
            problem={question.codingProblem}
            language={codeAnswers[question.id]?.language ?? question.codingProblem.allowedLanguages[0] ?? "python"}
            code={
              codeAnswers[question.id]?.code ??
              question.codingProblem.starterCode[question.codingProblem.allowedLanguages[0] ?? "python"] ??
              ""
            }
            onLanguageChange={(language) => handleLanguageChange(question.id, language)}
            onCodeChange={(code) => handleCodeChange(question.id, code)}
            onPasteDetected={() => reportViolation("copy_paste")}
            onRun={(sourceCode, language) => handleRunCode(question.id, sourceCode, language)}
          />
        ) : (
          <QuestionCard
            topic={`Question ${question.questionOrder}`}
            questionText={question.questionText}
            options={options}
            selectedOptionId={answers[question.id] ?? null}
            onSelect={(optionId) => selectOption(question.id, optionId)}
          />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-outline-variant bg-background/90 shadow-soft-ink-lg backdrop-blur-sm">
        <div className={`mx-auto flex ${containerWidthClass} items-center justify-between px-4 py-4`}>
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
      </div>
    </main>
  );
}
