import { Card } from "@/components/ui/Card";

interface BatchCount {
  batch: string;
  count: number;
}

export function BatchDistributionCard({ data }: { data: BatchCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <Card>
      <p className="mb-4 text-label-caps text-on-surface-variant">Students by batch</p>
      <div className="flex flex-col gap-3">
        {data.map((d) => (
          <div key={d.batch} className="flex items-center gap-3">
            <span className="w-6 font-serif text-body-lg font-semibold text-on-surface">{d.batch}</span>
            <div className="h-3 flex-1 rounded-full bg-surface-container-high">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-primary to-primary-container transition-all duration-500 ease-smooth"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-body-sm text-on-surface-variant">{d.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
