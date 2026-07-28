import { HTMLAttributes } from "react";
import clsx from "clsx";

// Level-1 surface per the design system: white card, 1px outline, soft-ink
// shadow reserved for floating/interactive states only (pass `interactive`).
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-outline-variant bg-surface-container-lowest p-6",
        interactive && "transition-shadow hover:shadow-soft-ink cursor-pointer",
        className
      )}
      {...props}
    />
  );
}
