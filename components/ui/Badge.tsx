import { HTMLAttributes } from "react";
import clsx from "clsx";

// Semantic status tone — NOT a free color choice. `sage` = healthy/no
// violations, `gold` = caution, `crimson` = needs action. Keep this mapping
// consistent everywhere a status appears (violations, results).
type Tone = "sage" | "gold" | "crimson" | "neutral";

const toneClasses: Record<Tone, string> = {
  sage: "bg-secondary-container text-on-secondary-container",
  gold: "bg-tertiary-container/40 text-tertiary",
  crimson: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-label-caps uppercase",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
