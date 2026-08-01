import { InputHTMLAttributes, forwardRef, useState } from "react";
import clsx from "clsx";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
        <path
          d="M1.5 10s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M1.5 10s3-6 8.5-6c1.7 0 3.13.55 4.31 1.27M18.5 10s-1.13 2.26-3.32 3.9M8.2 8.2a2.5 2.5 0 0 0 3.54 3.54M4.2 4.2l11.6 11.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Every password field in the app should go through this (not the plain
// Input) — a coordinator or student with no idea what they just typed into
// a masked field is the #1 cause of "why can't I log in" support pings.
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={clsx(
            "h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3.5 pr-11 text-body-md text-on-surface transition-all duration-200",
            "placeholder:text-on-surface-variant/50",
            "focus:border-primary focus:shadow-glow focus:outline-none",
            className
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
