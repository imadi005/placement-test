import { HTMLAttributes } from "react";
import clsx from "clsx";

// Level-1 surface per the design system: white card, soft ambient shadow,
// hairline border. Pass `interactive` for cards that act as click targets —
// they lift further and tint the border on hover.
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-soft-ink transition-all duration-300 ease-smooth",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft-ink-lg",
        className
      )}
      {...props}
    />
  );
}
