"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(json = true) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

interface TestRow {
  id: string;
  title: string;
  status: string;
  batchScope: string;
  approved: boolean;
}

function statusTone(status: string): "sage" | "gold" | "crimson" | "neutral" {
  if (status === "live") return "crimson";
  if (status === "scheduled") return "gold";
  if (status === "ended") return "neutral";
  return "neutral";
}

export default function CoordinatorHomePage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [batchScope, setBatchScope] = useState("ALL");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  async function loadTests() {
    try {
      const res = await fetch(`${API_URL}/tests`, { headers: authHeaders(false) });
      if (res.ok) setTests(await res.json());
      else setError("Couldn't load tests.");
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    }
  }

  useEffect(() => {
    loadTests();
  }, []);

  async function createTest() {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/tests`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title, batchScope, durationMinutes }),
      });
      if (res.ok) {
        setTitle("");
        await loadTests();
      } else {
        setError("Couldn't create the test.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function scheduleTest(testId: string) {
    const res = await fetch(`${API_URL}/tests/${testId}/schedule`, { method: "POST", headers: authHeaders(false) });
    if (res.ok) await loadTests();
    else {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? "Couldn't schedule — questions may need review/approval first.");
    }
  }

  async function approveQuestions(testId: string) {
    const res = await fetch(`${API_URL}/tests/${testId}/approve-questions`, { method: "POST", headers: authHeaders(false) });
    if (res.ok) await loadTests();
  }

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6">
        <h1 className="font-serif text-headline-md text-on-surface">Coordinator</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">Create, review, and run placement tests.</p>
      </header>

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      <Card className="mb-8">
        <p className="mb-4 text-label-caps text-on-surface-variant">Create a new test</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-body-sm text-on-surface-variant">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary"
              placeholder="Weekly Aptitude Test"
            />
          </label>
          <label>
            <span className="mb-1 block text-body-sm text-on-surface-variant">Batch scope</span>
            <select
              value={batchScope}
              onChange={(e) => setBatchScope(e.target.value)}
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface"
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
              className="w-24 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface"
            />
          </label>
          <Button onClick={createTest} disabled={isCreating || !title.trim()}>
            {isCreating ? "Creating…" : "Create"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {tests.map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md font-medium text-on-surface">{t.title}</p>
              <p className="text-body-sm text-on-surface-variant">Batch scope: {t.batchScope}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={statusTone(t.status)}>{t.status}</Badge>
              {!t.approved && (
                <Button variant="secondary" onClick={() => approveQuestions(t.id)}>
                  Approve questions
                </Button>
              )}
              <Button variant="secondary" onClick={() => router.push(`/coordinator/tests/${t.id}/questions`)}>
                Questions
              </Button>
              {t.status === "draft" && (
                <Button variant="secondary" onClick={() => scheduleTest(t.id)}>
                  Schedule
                </Button>
              )}
              <Button onClick={() => router.push(`/coordinator/live/${t.id}`)}>Monitor</Button>
            </div>
          </Card>
        ))}
        {tests.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No tests yet — create one above.</p>
        )}
      </div>
    </main>
  );
}
