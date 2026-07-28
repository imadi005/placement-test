import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface UpcomingTestCardProps {
  testId: string;
  title: string;
  description: string;
  date: string;
  durationLabel: string;
  hoursUntilStart: number;
  isLive: boolean;
}

export function UpcomingTestCard({
  testId,
  title,
  description,
  date,
  durationLabel,
  hoursUntilStart,
  isLive,
}: UpcomingTestCardProps) {
  const days = Math.floor(hoursUntilStart / 24);
  const hours = hoursUntilStart % 24;

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <Badge tone={isLive ? "crimson" : "sage"}>{isLive ? "Live now" : "Confirmed · Upcoming"}</Badge>
      <div>
        <h2 className="font-serif text-headline-md text-on-surface">{title}</h2>
        <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">{description}</p>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {date} · {durationLabel}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary">Download guidelines</Button>
        {isLive && <Button onClick={() => (window.location.href = `/test/${testId}`)}>Start test</Button>}
      </div>

      {/* Countdown only makes sense for a test that hasn't started yet — a
          live test showing "starts in 00:00" reads as broken, not accurate. */}
      {!isLive && (
        <div className="mt-2 w-full rounded-md bg-primary px-6 py-4 text-on-primary">
          <p className="text-label-caps opacity-80">Starts in</p>
          <div className="mt-1 flex items-center justify-center gap-4 font-serif text-3xl font-bold">
            <div>
              <div>{String(days).padStart(2, "0")}</div>
              <div className="text-label-caps font-sans font-normal opacity-80">Days</div>
            </div>
            <span>:</span>
            <div>
              <div>{String(hours).padStart(2, "0")}</div>
              <div className="text-label-caps font-sans font-normal opacity-80">Hours</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
