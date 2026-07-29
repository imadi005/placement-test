"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { LiveMonitoringTable, LiveStudentRow } from "@/components/coordinator/LiveMonitoringTable";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

export default function CoordinatorLiveMonitoringPage() {
  const ready = useAuthGuard(["coordinator"]);
  const params = useParams();
  const testId = params.testId as string;

  const [rows, setRows] = useState<LiveStudentRow[]>([]);
  const [testStatus, setTestStatus] = useState<string>("unknown");
  const [error, setError] = useState<string | null>(null);

  // Re-fetches the full snapshot rather than patching individual rows from
  // socket events — simpler and always consistent. Fine at this scale
  // (hundreds of active attempts per test); if this becomes a bottleneck at
  // 1200 concurrent, switch to incremental patches keyed by attemptId.
  const refreshSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tests/${testId}/live-status`, { headers: authHeaders() });
      if (res.ok) setRows(await res.json());
    } catch {
      setError("Couldn't reach the server for a status refresh.");
    }
  }, [testId]);

  useEffect(() => {
    if (!ready) return;
    async function loadTestStatus() {
      try {
        const res = await fetch(`${API_URL}/tests/${testId}`, { headers: authHeaders() });
        if (res.ok) setTestStatus((await res.json()).status);
      } catch {
        // testStatus just stays "unknown" — the socket's test_status_changed
        // event (or a start/stop action) will still correct it.
      }
    }
    loadTestStatus();
    refreshSnapshot();

    const socket = getSocket();
    socket.emit("test:join", { testId }, (ack: { activeStudentCount?: number }) => {
      // ack currently unused beyond confirming the join succeeded
    });

    function handleEvent(event: { type: string; status?: string }) {
      if (event.type === "test_status_changed" && event.status) {
        setTestStatus(event.status);
      }
      // join / violation / attempt_submitted all just trigger a refresh —
      // see note above on why this isn't patched incrementally yet.
      refreshSnapshot();
    }

    socket.on("test:event", handleEvent);
    return () => {
      socket.off("test:event", handleEvent);
    };
  }, [ready, testId, refreshSnapshot]);

  function sendControl(action: "start" | "stop") {
    const socket = getSocket();
    socket.emit(
      "coordinator:test_control",
      { testId, action },
      (response: { success?: boolean; status?: string; error?: string }) => {
        if (response.error) {
          setError(response.error);
        } else if (response.status) {
          setTestStatus(response.status);
        }
      }
    );
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-headline-md text-on-surface">Active session monitoring</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">Status: {testStatus}</p>
        </div>
        <div className="flex gap-2">
          {testStatus === "live" && (
            <Button variant="secondary" onClick={() => sendControl("stop")}>
              Stop test
            </Button>
          )}
          {(testStatus === "scheduled" || testStatus === "draft") && (
            <Button onClick={() => sendControl("start")}>Start test</Button>
          )}
        </div>
      </header>

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Active students" value={String(rows.length)} />
        <StatCard
          label="Violation alerts"
          value={String(rows.reduce((sum, r) => sum + r.violationCount, 0))}
          valueClassName="text-error"
        />
      </div>

      <LiveMonitoringTable rows={rows} />
    </main>
  );
}
