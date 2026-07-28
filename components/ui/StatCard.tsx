import { Card } from "./Card";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  valueClassName?: string;
  sublabel?: string;
}

// The large-serif-number pattern used across dashboards and the coordinator's
// live monitoring grid — one shape, reused everywhere a single metric needs
// to read at a glance.
export function StatCard({ label, value, valueClassName, sublabel }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-label-caps text-on-surface-variant">{label}</span>
      <span className={clsx("font-serif text-4xl font-bold text-on-surface", valueClassName)}>
        {value}
      </span>
      {sublabel && <span className="text-body-sm text-on-surface-variant">{sublabel}</span>}
    </Card>
  );
}
