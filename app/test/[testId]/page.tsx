"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TestHeader } from "@/components/test/TestHeader";
import { QuestionCard, Option } from "@/components/test/QuestionCard";
import { CodingQuestionCard, CodingProblemView } from "@/components/test/CodingQuestionCard";
import { QuestionPalette, QuestionStatus } from "@/components/test/QuestionPalette";
import { SubmitConfirmModal } from "@/components/test/SubmitConfirmModal";
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
  // `byLanguage` keeps each language's own buffer, so switching tabs (C ->
  // Python -> C) never loses or overwrites what the student wrote in
  // another language — same as a real LeetCode "language" selector. Only
  // the currently-selected language's code is ever sent to the backend
  // (AttemptAnswer stores exactly one submittedCode/codeLanguage pair per
  // question), so anything typed in a language the student switches away
  // from without submitting is a this-session-only convenience, not a
  // second persisted draft.
  const [codeAnswers, setCodeAnswers] = useState<Record<string, { language: string; byLanguage: Record<string, string> }>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  // Distinct from "answered" — a question the student opened but left blank
  // is "not answered" (red), one they never opened at all is "not visited"
  // (gray), the standard exam-portal distinction.
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        markedForReview: boolean;
      }[] = data.existingAnswers ?? [];
      const restoredOptions: Record<string, string> = {};
      const restoredCode: Record<string, { language: string; byLanguage: Record<string, string> }> = {};
      const restoredMarks: Record<string, boolean> = {};
      for (const a of existing) {
        if (a.selectedOptionId) restoredOptions[a.questionId] = a.selectedOptionId;
        if (a.submittedCode && a.codeLanguage) {
          restoredCode[a.questionId] = { language: a.codeLanguage, byLanguage: { [a.codeLanguage]: a.submittedCode } };
        }
        if (a.markedForReview) restoredMarks[a.questionId] = true;
      }
      // LeetCode-style now: starterCode is always just the function stub
      // (never a full solution — the judge calls the student's function by
      // name/signature, so there's nothing to "give away" by pre-filling
      // it), so every coding question opens with it pre-filled, same as a
      // real LeetCode problem — unless the student already has a saved
      // draft for it.
      for (const q of loadedQuestions) {
        if (q.questionType === "coding" && q.codingProblem && !restoredCode[q.id]) {
          const language = q.codingProblem.allowedLanguages[0] ?? "python";
          const starterCode = q.codingProblem.starterCode as Record<string, string>;
          restoredCode[q.id] = { language, byLanguage: { [language]: starterCode[language] ?? "" } };
        }
      }
      setAnswers(restoredOptions);
      setCodeAnswers(restoredCode);
      setMarkedForReview(restoredMarks);
      if (loadedQuestions.length > 0) setVisited({ [loadedQuestions[0].id]: true });

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

  function goToIndex(index: number) {
    const clamped = Math.max(0, Math.min(questions.length - 1, index));
    setCurrentIndex(clamped);
    const targetId = questions[clamped]?.id;
    if (targetId) setVisited((prev) => ({ ...prev, [targetId]: true }));
  }

  function toggleMarkForReview(questionId: string) {
    const next = !markedForReview[questionId];
    setMarkedForReview((prev) => ({ ...prev, [questionId]: next }));
    if (!attemptId) return;
    authFetch(`${API_URL}/attempts/${attemptId}/answers`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ questionId, markedForReview: next }),
    }).catch(() => {});
  }

  // MCQ: an option is selected. Coding: the student changed something from
  // the starter stub (a blank/untouched editor shouldn't count as answered).
  function isAnswered(q: BackendQuestion): boolean {
    if (q.questionType === "coding" && q.codingProblem) {
      const entry = codeAnswers[q.id];
      if (!entry) return false;
      const code = entry.byLanguage[entry.language] ?? "";
      const starter = (q.codingProblem.starterCode as Record<string, string>)[entry.language] ?? "";
      return code.trim() !== "" && code !== starter;
    }
    return Boolean(answers[q.id]);
  }

  function statusFor(index: number): QuestionStatus {
    const q = questions[index];
    if (!q) return "not_visited";
    if (markedForReview[q.id]) return "marked";
    if (isAnswered(q)) return "answered";
    if (visited[q.id]) return "not_answered";
    return "not_visited";
  }

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
    const language = codeAnswers[questionId]?.language ?? "python";
    setCodeAnswers((prev) => ({
      ...prev,
      [questionId]: {
        language,
        byLanguage: { ...prev[questionId]?.byLanguage, [language]: code },
      },
    }));
    saveCodeAnswer(questionId, code, language);
  }

  function handleLanguageChange(questionId: string, language: string) {
    // Switching tabs — if this language has no buffer yet this session,
    // seed it from starterCode (the function stub) rather than leaving it
    // blank or carrying over whatever was typed in the PREVIOUS language.
    const question = questions.find((q) => q.id === questionId);
    const starterCode = (question?.codingProblem?.starterCode ?? {}) as Record<string, string>;
    const existing = codeAnswers[questionId]?.byLanguage[language];
    const code = existing ?? starterCode[language] ?? "";

    setCodeAnswers((prev) => ({
      ...prev,
      [questionId]: {
        language,
        byLanguage: { ...prev[questionId]?.byLanguage, [language]: code },
      },
    }));
    saveCodeAnswer(questionId, code, language);
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
    setIsSubmitting(true);
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
          body: JSON.stringify({
            questionId,
            submittedCode: entry.byLanguage[entry.language] ?? "",
            codeLanguage: entry.language,
          }),
        }).catch(() => {});
      }

      await authFetch(`${API_URL}/attempts/${attemptId}/submit`, {
        method: "POST",
      });
    } finally {
      setIsSubmitting(false);
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
  const containerWidthClass = isCoding ? "max-w-7xl" : "max-w-5xl";
  const isMarked = Boolean(markedForReview[question.id]);

  const answeredCount = questions.filter((q) => isAnswered(q)).length;
  const markedCount = questions.filter((q) => markedForReview[q.id]).length;
  const notAnsweredCount = questions.length - answeredCount;

  return (
    <main className={`mx-auto min-h-screen ${containerWidthClass} px-4 pb-24`}>
      <TestHeader
        currentQuestion={currentIndex + 1}
        totalQuestions={questions.length}
        timeRemainingLabel={formatTime(secondsLeft)}
        isLowTime={isLowTime}
      />

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_240px] lg:items-start lg:gap-6">
        <div>
          {isCoding && question.codingProblem ? (
            <CodingQuestionCard
              topic={`Question ${question.questionOrder}`}
              questionText={question.questionText}
              problem={question.codingProblem}
              language={codeAnswers[question.id]?.language ?? question.codingProblem.allowedLanguages[0] ?? "python"}
              code={
                codeAnswers[question.id]?.byLanguage[
                  codeAnswers[question.id]?.language ?? question.codingProblem.allowedLanguages[0] ?? "python"
                ] ??
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

        <div className="mt-6 lg:mt-0">
          <QuestionPalette
            total={questions.length}
            currentIndex={currentIndex}
            statusFor={statusFor}
            onJump={goToIndex}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-outline-variant bg-background/90 shadow-soft-ink-lg backdrop-blur-sm">
        <div className={`mx-auto flex ${containerWidthClass} items-center justify-between gap-2 px-4 py-4`}>
          <Button variant="ghost" disabled={currentIndex === 0} onClick={() => goToIndex(currentIndex - 1)}>
            ← Previous
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => toggleMarkForReview(question.id)}>
              {isMarked ? "Marked ✓" : "Mark for review"}
            </Button>
            {currentIndex < questions.length - 1 && (
              <Button onClick={() => goToIndex(currentIndex + 1)}>Save & next →</Button>
            )}
            <Button variant="primary" onClick={() => setShowSubmitModal(true)}>
              Submit test
            </Button>
          </div>
        </div>
      </div>

      {showSubmitModal && (
        <SubmitConfirmModal
          total={questions.length}
          answered={answeredCount}
          notAnswered={notAnsweredCount}
          marked={markedCount}
          isSubmitting={isSubmitting}
          onCancel={() => setShowSubmitModal(false)}
          onConfirm={() => handleSubmit("manual")}
        />
      )}
    </main>
  );
}
