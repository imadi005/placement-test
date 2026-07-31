"use client";

import { useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface CodingSampleCase {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface CodingProblemView {
  constraints: string | null;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: string[];
  starterCode: Record<string, string>;
  testCases: CodingSampleCase[];
}

export interface RunCaseResult {
  testCaseId: string;
  isSample: boolean;
  passed: boolean;
  actualOutput: string;
  stderr: string | null;
  compileOutput: string | null;
  status: string;
  timeMs: number | null;
}

const LANGUAGE_LABELS: Record<string, string> = { c: "C", cpp: "C++", java: "Java", python: "Python" };
const MONACO_LANGUAGE: Record<string, string> = { c: "c", cpp: "cpp", java: "java", python: "python" };
const STATUS_LABELS: Record<string, string> = {
  accepted: "Passed",
  wrong_answer: "Wrong answer",
  compile_error: "Compile error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  judge_unavailable: "Judge unavailable — try again shortly",
  unsupported_language: "Language not supported for this problem",
};

interface Props {
  topic: string;
  questionText: string;
  problem: CodingProblemView;
  language: string;
  code: string;
  onLanguageChange: (language: string) => void;
  onCodeChange: (code: string) => void;
  onPasteDetected: () => void;
  onRun: (code: string, language: string) => Promise<{ results: RunCaseResult[] }>;
}

// The LeetCode-style split view for a coding question — rendered in place of
// QuestionCard for this question type, inside the same test flow (no
// separate page/route). Left: problem + constraints + sample cases + run
// results. Right: language picker + editor.
export function CodingQuestionCard({
  topic,
  questionText,
  problem,
  language,
  code,
  onLanguageChange,
  onCodeChange,
  onPasteDetected,
  onRun,
}: Props) {
  const pasteWiredRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResults, setRunResults] = useState<RunCaseResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const handleMount: OnMount = (editor) => {
    // Anti-cheat: flag any paste into the editor as a copy_paste violation
    // (same event type the rest of the exam already tracks) — wired once
    // per editor mount, not once per keystroke.
    if (pasteWiredRef.current) return;
    pasteWiredRef.current = true;
    const domNode = editor.getDomNode();
    domNode?.addEventListener("paste", () => onPasteDetected());
  };

  function handleLanguageChange(next: string) {
    // Only switches the language tag (syntax highlighting / submission
    // target) — never injects any code, written or starter, so there's
    // nothing here that needs a confirm-before-overwrite prompt.
    onLanguageChange(next);
    setRunResults(null);
    setRunError(null);
  }

  async function handleRun() {
    setIsRunning(true);
    setRunError(null);
    try {
      const data = await onRun(code, language);
      setRunResults(data.results);
    } catch {
      setRunError("Couldn't reach the judge. Try again in a moment.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-label-caps text-primary">{topic}</p>
          <h1 className="mt-3 font-serif text-headline-md text-on-surface">{questionText}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Time limit: {problem.timeLimitMs}ms</Badge>
          <Badge tone="neutral">Memory limit: {problem.memoryLimitMb}MB</Badge>
        </div>

        {problem.constraints && (
          <div>
            <p className="mb-1 text-label-caps text-on-surface-variant">Constraints</p>
            <p className="whitespace-pre-wrap text-body-sm text-on-surface-variant">{problem.constraints}</p>
          </div>
        )}

        {problem.testCases.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-label-caps text-on-surface-variant">Sample test cases</p>
            {problem.testCases.map((tc, i) => {
              const result = runResults?.find((r) => r.testCaseId === tc.id);
              return (
                <div key={tc.id} className="rounded-md border border-outline-variant bg-surface-container-low p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-label-caps text-on-surface-variant">Sample {i + 1}</p>
                    {result && (
                      <Badge tone={result.passed ? "sage" : "crimson"}>
                        {STATUS_LABELS[result.status] ?? result.status}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-label-caps text-on-surface-variant">Input</p>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-surface-container-lowest p-2 font-mono text-body-sm text-on-surface">
                        {tc.input || "—"}
                      </pre>
                    </div>
                    <div>
                      <p className="text-label-caps text-on-surface-variant">Expected output</p>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-surface-container-lowest p-2 font-mono text-body-sm text-on-surface">
                        {tc.expectedOutput || "—"}
                      </pre>
                    </div>
                  </div>
                  {result && !result.passed && (
                    <div className="mt-2">
                      <p className="text-label-caps text-on-surface-variant">Your output</p>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-error-container p-2 font-mono text-body-sm text-on-error-container">
                        {result.compileOutput || result.stderr || result.actualOutput || "(no output)"}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {runError && (
          <p className="rounded-md bg-error-container px-3 py-2 text-body-sm text-on-error-container">{runError}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1 rounded-md bg-surface-container-high p-1">
            {problem.allowedLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleLanguageChange(lang)}
                className={`rounded px-3 py-1.5 text-body-sm font-medium transition-all ${
                  language === lang
                    ? "bg-surface-container-lowest text-on-surface shadow-soft-ink"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {LANGUAGE_LABELS[lang] ?? lang}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="md" onClick={handleRun} disabled={isRunning}>
            {isRunning ? "Running…" : "▶ Run"}
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border border-outline-variant shadow-soft-ink">
          <Editor
            height="480px"
            theme="vs-dark"
            language={MONACO_LANGUAGE[language] ?? "plaintext"}
            value={code}
            onChange={(value) => onCodeChange(value ?? "")}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  );
}
