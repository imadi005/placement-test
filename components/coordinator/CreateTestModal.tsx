"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { QuestionReviewCard, EditableQuestion } from "@/components/questions/QuestionReviewCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(json = true) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

interface Props {
  onClose: () => void;
  onDone: () => void;
}

// One modal, start to finish: test details, upload + confirm questions,
// then either "Start immediately" or "Schedule". The draft test is created
// silently the first time a question is added (upload or blank) so the
// upload/commit calls have a real testId to work against — the coordinator
// never sees that as a separate step. There's no "approve" step: reviewing
// the questions here IS the approval, so submitting either action commits
// + approves + starts/schedules in one go.
export function CreateTestModal({ onClose, onDone }: Props) {
  const [title, setTitle] = useState("");
  const [batchScope, setBatchScope] = useState("ALL");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [testId, setTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<"start" | "schedule" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureTestCreated(): Promise<string | null> {
    if (testId) return testId;
    if (!title.trim()) {
      setError("Give the test a title first.");
      return null;
    }
    const res = await fetch(`${API_URL}/tests`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, batchScope, durationMinutes }),
    });
    if (!res.ok) {
      setError("Couldn't create the test.");
      return null;
    }
    const created = await res.json();
    setTestId(created.id);
    return created.id;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = await ensureTestCreated();
    if (!id) return;

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/tests/${id}/questions/parse-preview`, {
        method: "POST",
        headers: authHeaders(false),
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Couldn't parse this file.");
        return;
      }
      const draft: Array<{
        questionText: string;
        questionOrder: number;
        questionType: string;
        options: { label: string; text: string; isCorrect: boolean }[];
        modelAnswer?: string | null;
        parseWarning?: string | null;
      }> = await res.json();
      setQuestions(
        draft.map((q) => ({ ...q, options: q.options.map((o) => ({ optionText: o.text, isCorrect: o.isCorrect })) }))
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function addBlankQuestion() {
    const id = await ensureTestCreated();
    if (!id) return;
    setQuestions((prev) => [
      ...prev,
      {
        questionText: "",
        questionOrder: prev.length + 1,
        questionType: "mcq",
        options: [
          { optionText: "", isCorrect: true },
          { optionText: "", isCorrect: false },
          { optionText: "", isCorrect: false },
          { optionText: "", isCorrect: false },
        ],
      },
    ]);
  }

  function updateQuestion(index: number, updated: EditableQuestion) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
  }
  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  // Commit + approve are always done together here — there's no separate
  // "approve" affordance in this UI. Reviewing the cards below is the
  // approval; clicking Start/Schedule finalizes it.
  async function commitAndApprove(id: string) {
    const commitRes = await fetch(`${API_URL}/tests/${id}/questions/commit`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ questions }),
    });
    if (!commitRes.ok) throw new Error("Couldn't save the question set.");
    const approveRes = await fetch(`${API_URL}/tests/${id}/approve-questions`, {
      method: "POST",
      headers: authHeaders(false),
    });
    if (!approveRes.ok) throw new Error("Couldn't approve the question set.");
  }

  async function handleStartNow() {
    if (!testId || questions.length === 0) return;
    setIsSubmitting("start");
    setError(null);
    try {
      await commitAndApprove(testId);
      const res = await fetch(`${API_URL}/tests/${testId}/start`, { method: "POST", headers: authHeaders(false) });
      if (!res.ok) throw new Error("Couldn't start the test.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(null);
    }
  }

  async function handleSchedule() {
    if (!testId || questions.length === 0 || !date || !time) return;
    setIsSubmitting("schedule");
    setError(null);
    try {
      const patchRes = await fetch(`${API_URL}/tests/${testId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ scheduledStart: new Date(`${date}T${time}`).toISOString() }),
      });
      if (!patchRes.ok) throw new Error("Couldn't set the schedule time.");
      await commitAndApprove(testId);
      const res = await fetch(`${API_URL}/tests/${testId}/schedule`, { method: "POST", headers: authHeaders(false) });
      if (!res.ok) throw new Error("Couldn't schedule the test.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(null);
    }
  }

  const canSubmit = questions.length > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-on-surface/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-soft-ink">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-headline-md text-on-surface">New placement test</h2>
          <button onClick={onClose} className="text-body-sm text-on-surface-variant">
            Close
          </button>
        </div>

        {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

        {/* Details */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="mb-1 block text-body-sm text-on-surface-variant">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={Boolean(testId)}
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary disabled:opacity-60"
              placeholder="Weekly Aptitude Test"
            />
          </label>
          <label>
            <span className="mb-1 block text-body-sm text-on-surface-variant">Batch scope</span>
            <select
              value={batchScope}
              onChange={(e) => setBatchScope(e.target.value)}
              disabled={Boolean(testId)}
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface disabled:opacity-60"
            >
              <option value="ALL">All batches</option>
              <option value="A">Batch A</option>
              <option value="B">Batch B</option>
              <option value="C">Batch C</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-body-sm text-on-surface-variant">Duration (min)</span>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              disabled={Boolean(testId)}
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface disabled:opacity-60"
            />
          </label>
        </div>

        {/* When to run it */}
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={`rounded-md px-3 py-1.5 text-body-sm ${
              mode === "now" ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            Start immediately
          </button>
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={`rounded-md px-3 py-1.5 text-body-sm ${
              mode === "schedule" ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            Schedule for later
          </button>
        </div>

        {mode === "schedule" && (
          <div className="mb-6 grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-body-sm text-on-surface-variant">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <label>
              <span className="mb-1 block text-body-sm text-on-surface-variant">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface"
              />
            </label>
          </div>
        )}

        {/* Upload + confirm */}
        <div className="mb-6 border-t border-outline-variant pt-6">
          <p className="mb-3 text-label-caps text-on-surface-variant">Question set</p>
          {questions.length === 0 ? (
            <div className="rounded-md border border-dashed border-outline-variant p-6 text-center">
              <label className="cursor-pointer">
                <input type="file" accept=".docx,.pdf" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                <span className="text-body-md text-primary underline underline-offset-2">
                  {isUploading ? "Parsing…" : "Upload a .docx or .pdf question set"}
                </span>
              </label>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                or{" "}
                <button onClick={addBlankQuestion} className="text-primary underline underline-offset-2">
                  add a question manually
                </button>
              </p>
            </div>
          ) : (
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              {questions.map((q, i) => (
                <QuestionReviewCard
                  key={i}
                  question={q}
                  onChange={(updated) => updateQuestion(i, updated)}
                  onRemove={() => removeQuestion(i)}
                />
              ))}
              <button onClick={addBlankQuestion} className="text-left text-body-sm text-primary underline underline-offset-2">
                + Add another question
              </button>
            </div>
          )}
        </div>

        {/* Final action */}
        <div className="flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
          {mode === "schedule" ? (
            <Button
              onClick={handleSchedule}
              disabled={!canSubmit || !date || !time || isSubmitting !== null}
            >
              {isSubmitting === "schedule" ? "Scheduling…" : "Schedule"}
            </Button>
          ) : (
            <Button onClick={handleStartNow} disabled={!canSubmit || isSubmitting !== null}>
              {isSubmitting === "start" ? "Starting…" : "Start immediately"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
