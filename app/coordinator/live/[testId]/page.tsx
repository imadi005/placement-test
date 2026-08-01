"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LiveMonitoringTable, LiveStudentRow } from "@/components/coordinator/LiveMonitoringTable";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { authFetch } from "@/lib/authFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge tone="crimson">LIVE</Badge>;
  if (status === "ended") return <Badge tone="neutral">ENDED</Badge>;
  if (status === "scheduled") return <Badge tone="gold">SCHEDULED</Badge>;
  if (status === "draft") return <Badge tone="gold">DRAFT</Badge>;
  return <Badge tone="neutral">—</Badge>;
}

export default function CoordinatorLiveMonitoringPage() {
  const ready = useAuthGuard(["coordinator"]);
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;

  const [rows, setRows] = useState<LiveStudentRow[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalEligible, setTotalEligible] = useState(0);
  const [testTitle, setTestTitle] = useState("");
  const [testStatus, setTestStatus] = useState<string>("unknown");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-fetches the full snapshot rather than patching individual rows from
  // socket events — simpler and always consistent. Fine at this scale
  // (hundreds of active attempts per test); if this becomes a bottleneck at
  // 1200 concurrent, switch to incremental patches keyed by attemptId.
  const refreshSnapshot = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/tests/${testId}/live-status`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.students);
        setSubmittedCount(data.submittedCount);
        setTotalEligible(data.totalEligible);
        setLastUpdated(new Date());
      }
    } catch {
      setError("Couldn't reach the server for a status refresh.");
    }
  }, [testId]);

  useEffect(() => {
    if (!ready) return;
    async function loadTest() {
      try {
        const res = await authFetch(`${API_URL}/tests/${testId}`);
        if (res.ok) {
          const test = await res.json();
          setTestStatus(test.status);
          setTestTitle(test.title);
        }
      } catch {
        // testStatus just stays "unknown" — the socket's test_status_changed
        // event (or a start/stop action) will still correct it.
      }
    }
    loadTest();
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

    // Belt-and-suspenders poll — the socket relay covers every real event,
    // but a coordinator staring at this screen for a while should never see
    // a stale snapshot even if a socket event were ever missed.
    const pollInterval = setInterval(refreshSnapshot, 10000);

    return () => {
      socket.off("test:event", handleEvent);
      clearInterval(pollInterval);
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

  const totalViolations = rows.reduce((sum, r) => sum + r.violationCount, 0);

  return (
    <main className="mx-auto max-w-container animate-fade-in-up px-4 py-8 md:px-gutter">
      <Button variant="ghost" className="mb-4" onClick={() => router.push("/coordinator")}>
        ← Back to coordinator
      </Button>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-headline-md text-on-surface">
              {testTitle || "Active session monitoring"}
            </h1>
            <StatusBadge status={testStatus} />
          </div>
          {lastUpdated && (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
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
          {(testStatus === "live" || testStatus === "ended") && (
            <Button variant="secondary" onClick={() => router.push(`/coordinator/tests/${testId}/analytics`)}>
              Analytics
            </Button>
          )}
        </div>
      </header>

      {testStatus === "ended" && (
        <div className="mb-6 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">
          This test has ended — no further live activity will appear here. The breakdown below reflects
          the final moment before it ended.
        </div>
      )}

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active now" value={String(rows.length)} />
        <StatCard label="Submitted" value={String(submittedCount)} />
        <StatCard label="Total eligible" value={String(totalEligible)} />
        <StatCard
          label="Violation alerts"
          value={String(totalViolations)}
          valueClassName={totalViolations > 0 ? "text-error" : undefined}
        />
      </div>

      <LiveMonitoringTable rows={rows} />
    </main>
  );
}
