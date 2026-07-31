"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CODING_LANGUAGES, EditableCodingProblem, EditableCodingTestCase } from "./coding-types";

interface Props {
  problem: EditableCodingProblem;
  onChange: (updated: EditableCodingProblem) => void;
}

// The coordinator-side authoring surface for a "coding" question — everything
// LeetCode-style: constraints, per-language starter code, and the test-case
// bank (sample cases the student sees, hidden ones the judge checks against).
export function CodingProblemEditor({ problem, onChange }: Props) {
  const [activeLang, setActiveLang] = useState(problem.allowedLanguages[0] ?? "python");

  function toggleLanguage(id: string) {
    const enabled = problem.allowedLanguages.includes(id);
    const allowedLanguages = enabled
      ? problem.allowedLanguages.filter((l) => l !== id)
      : [...problem.allowedLanguages, id];
    onChange({ ...problem, allowedLanguages });
    if (!enabled) setActiveLang(id);
    else if (activeLang === id) setActiveLang(allowedLanguages[0] ?? "python");
  }

  function updateStarterCode(lang: string, code: string) {
    onChange({ ...problem, starterCode: { ...problem.starterCode, [lang]: code } });
  }

  function updateTestCase(index: number, patch: Partial<EditableCodingTestCase>) {
    const testCases = problem.testCases.map((tc, i) => (i === index ? { ...tc, ...patch } : tc));
    onChange({ ...problem, testCases });
  }

  function addTestCase() {
    onChange({
      ...problem,
      testCases: [...problem.testCases, { input: "", expectedOutput: "", isSample: false, points: 1 }],
    });
  }

  function removeTestCase(index: number) {
    onChange({ ...problem, testCases: problem.testCases.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-outline-variant pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-body-sm font-medium text-on-surface-variant">
          Constraints / input-output format
        </span>
        <textarea
          value={problem.constraints}
          onChange={(e) => onChange({ ...problem, constraints: e.target.value })}
          rows={3}
          placeholder={"e.g. 1 ≤ n ≤ 10^5. First line: n. Second line: n space-separated integers."}
          className="w-full rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-sm text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-on-surface-variant">Time limit (ms)</span>
          <Input
            type="number"
            value={problem.timeLimitMs}
            onChange={(e) => onChange({ ...problem, timeLimitMs: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-on-surface-variant">Memory limit (MB)</span>
          <Input
            type="number"
            value={problem.memoryLimitMb}
            onChange={(e) => onChange({ ...problem, memoryLimitMb: Number(e.target.value) })}
          />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-body-sm font-medium text-on-surface-variant">
          Languages students may use
        </span>
        <div className="flex flex-wrap gap-2">
          {CODING_LANGUAGES.map((lang) => {
            const enabled = problem.allowedLanguages.includes(lang.id);
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => toggleLanguage(lang.id)}
                className={`rounded-full border px-3 py-1 text-body-sm font-medium transition-colors ${
                  enabled
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-outline"
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      {problem.allowedLanguages.length > 0 && (
        <div>
          <span className="mb-1.5 block text-body-sm font-medium text-on-surface-variant">
            Starter code (pre-filled into the student's editor per language)
          </span>
          <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-surface-container-high p-1">
            {problem.allowedLanguages.map((id) => {
              const lang = CODING_LANGUAGES.find((l) => l.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveLang(id)}
                  className={`rounded px-3 py-1 text-body-sm font-medium transition-all ${
                    activeLang === id
                      ? "bg-surface-container-lowest text-on-surface shadow-soft-ink"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {lang?.label ?? id}
                </button>
              );
            })}
          </div>
          <div className="overflow-hidden rounded-md border border-outline-variant">
            <Editor
              height="200px"
              theme="vs-dark"
              language={activeLang === "cpp" ? "cpp" : activeLang}
              value={problem.starterCode[activeLang] ?? ""}
              onChange={(value) => updateStarterCode(activeLang, value ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-body-sm font-medium text-on-surface-variant">Test cases</span>
          <Button variant="secondary" size="md" onClick={addTestCase}>
            + Add test case
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {problem.testCases.map((tc, i) => (
            <div key={i} className="rounded-md border border-outline-variant p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={tc.isSample}
                    onChange={(e) => updateTestCase(i, { isSample: e.target.checked })}
                  />
                  Sample (visible to student)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                    Points
                    <input
                      type="number"
                      value={tc.points}
                      onChange={(e) => updateTestCase(i, { points: Number(e.target.value) })}
                      className="h-8 w-16 rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm text-on-surface"
                    />
                  </label>
                  <button
                    onClick={() => removeTestCase(i)}
                    className="text-body-sm text-error underline underline-offset-2"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-label-caps text-on-surface-variant">Input</span>
                  <textarea
                    value={tc.input}
                    onChange={(e) => updateTestCase(i, { input: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-outline-variant bg-surface-container-lowest p-2 font-mono text-body-sm text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-label-caps text-on-surface-variant">Expected output</span>
                  <textarea
                    value={tc.expectedOutput}
                    onChange={(e) => updateTestCase(i, { expectedOutput: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-outline-variant bg-surface-container-lowest p-2 font-mono text-body-sm text-on-surface transition-all focus:border-primary focus:shadow-glow focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ))}
          {problem.testCases.length === 0 && (
            <p className="text-body-sm text-on-surface-variant">
              No test cases yet — add at least one sample case.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
