import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

// Every text/password field in the app should go through this component so
// height, radius, and focus states stay consistent with Button/Card.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3.5 text-body-md text-on-surface transition-all duration-200",
        "placeholder:text-on-surface-variant/50",
        "focus:border-primary focus:shadow-glow focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
