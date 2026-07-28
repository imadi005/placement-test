import { Badge } from "@/components/ui/Badge";

interface Props {
  status: string;
  scheduledStart: string | null;
  now: number;
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// The one place that decides what a test's status reads like to a
// coordinator glancing at the dashboard — ticks because `now` is refreshed
// by the parent on an interval, not because this component polls anything.
export function TestStatusBadge({ status, scheduledStart, now }: Props) {
  if (status === "live") {
    const startedMs = scheduledStart ? now - new Date(scheduledStart).getTime() : 0;
    return <Badge tone="crimson">Live · started {formatDuration(startedMs)} ago</Badge>;
  }
  if (status === "scheduled" && scheduledStart) {
    const untilMs = new Date(scheduledStart).getTime() - now;
    return <Badge tone="gold">{untilMs > 0 ? `Starts in ${formatDuration(untilMs)}` : "Starting soon"}</Badge>;
  }
  if (status === "ended") return <Badge tone="neutral">Ended</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}
