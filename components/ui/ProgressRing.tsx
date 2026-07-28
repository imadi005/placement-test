interface ProgressRingProps {
  percent: number;
  label: string;
  sublabel: string;
  color?: string;
  size?: number;
}

// Used on the student dashboard's attendance summary. `percent` drives the
// stroke-dasharray directly — no animation library needed for something this
// simple, keep it a plain SVG.
export function ProgressRing({
  percent,
  label,
  sublabel,
  color = "#96440f",
  size = 96,
}: ProgressRingProps) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#eee7e3"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-serif text-xl font-semibold">
          {percent}%
        </span>
      </div>
      <div className="text-center">
        <p className="text-body-sm font-medium text-on-surface">{label}</p>
        <p className="text-label-caps text-on-surface-variant">{sublabel}</p>
      </div>
    </div>
  );
}
