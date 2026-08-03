import { Badge } from "@/components/ui/Badge";

interface Props {
  status: string;
  scheduledStart: string | null;
  startedAt: string | null;
  now: number;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCountdown(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// The one place that decides what a test's status reads like to a
// coordinator glancing at the dashboard. Ticks live (mm:ss) for a running
// test because `now` is refreshed by the parent every second — this
// component itself doesn't poll anything.
export function TestStatusBadge({ status, scheduledStart, startedAt, now }: Props) {
  if (status === "live") {
    // `startedAt` is when the test actually went live — a manual "Start
    // now" on a draft has no `scheduledStart` at all, which used to leave
    // this stuck at 00:00 forever. Falls back to `scheduledStart` only for
    // rows that went live before this field existed.
    const since = startedAt ?? scheduledStart;
    const startedMs = since ? now - new Date(since).getTime() : 0;
    return <Badge tone="crimson">Live · {formatElapsed(startedMs)}</Badge>;
  }
  if (status === "scheduled" && scheduledStart) {
    const untilMs = new Date(scheduledStart).getTime() - now;
    return <Badge tone="gold">{untilMs > 0 ? `Starts in ${formatCountdown(untilMs)}` : "Starting soon"}</Badge>;
  }
  if (status === "ended") return <Badge tone="neutral">Ended</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}
