import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface UpcomingTestCardProps {
  title: string;
  description: string;
  date: string;
  durationLabel: string;
  hoursUntilStart: number;
}

export function UpcomingTestCard({
  title,
  description,
  date,
  durationLabel,
  hoursUntilStart,
}: UpcomingTestCardProps) {
  const days = Math.floor(hoursUntilStart / 24);
  const hours = hoursUntilStart % 24;

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <Badge tone="sage">Confirmed · Upcoming</Badge>
      <div>
        <h2 className="font-serif text-headline-md text-on-surface">{title}</h2>
        <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">{description}</p>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {date} · {durationLabel}
      </p>
      <Button variant="secondary">Download guidelines</Button>

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
    </Card>
  );
}
