"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CreateTestModal } from "@/components/coordinator/CreateTestModal";
import { TestStatusBadge } from "@/components/coordinator/TestStatusBadge";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface TestRow {
  id: string;
  title: string;
  status: string;
  batchScope: string;
  scheduledStart: string | null;
}

export default function CoordinatorHomePage() {
  const ready = useAuthGuard(["coordinator"]);
  const router = useRouter();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function loadTests() {
    try {
      const res = await fetch(`${API_URL}/tests`, { headers: authHeaders() });
      if (res.ok) setTests(await res.json());
      else setError("Couldn't load tests.");
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadTests();
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    const refreshInterval = setInterval(loadTests, 5000);
    return () => {
      clearInterval(tickInterval);
      clearInterval(refreshInterval);
    };
  }, [ready]);

  async function startTest(testId: string) {
    const res = await fetch(`${API_URL}/tests/${testId}/start`, { method: "POST", headers: authHeaders() });
    if (res.ok) {
      await loadTests();
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? "Couldn't start the test.");
    }
  }

  async function stopTest(testId: string) {
    const res = await fetch(`${API_URL}/tests/${testId}/stop`, { method: "POST", headers: authHeaders() });
    if (res.ok) await loadTests();
    else setError("Couldn't stop the test.");
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-headline-md text-on-surface">Coordinator</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">Create, review, and run placement tests.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ New test</Button>
      </header>

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      <div className="flex flex-col gap-3">
        {tests.map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <div>
              <p className="text-body-md font-medium text-on-surface">{t.title}</p>
              <p className="text-body-sm text-on-surface-variant">Batch scope: {t.batchScope}</p>
            </div>
            <div className="flex items-center gap-3">
              <TestStatusBadge status={t.status} scheduledStart={t.scheduledStart} now={now} />
              {t.status === "draft" && (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/coordinator/tests/${t.id}/questions`)}
                >
                  Add questions
                </Button>
              )}
              {(t.status === "scheduled" || t.status === "draft") && (
                <Button variant="secondary" onClick={() => startTest(t.id)}>
                  Start now
                </Button>
              )}
              {t.status === "live" && (
                <Button variant="secondary" onClick={() => stopTest(t.id)}>
                  Stop test
                </Button>
              )}
              {t.status !== "draft" && (
                <Button onClick={() => router.push(`/coordinator/live/${t.id}`)}>Monitor</Button>
              )}
            </div>
          </Card>
        ))}
        {tests.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No tests yet — create one to get started.</p>
        )}
      </div>

      {showModal && (
        <CreateTestModal
          onClose={() => setShowModal(false)}
          onDone={() => {
            setShowModal(false);
            loadTests();
          }}
        />
      )}
    </main>
  );
}
