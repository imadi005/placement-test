import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary shadow-soft-ink hover:bg-primary-container hover:shadow-soft-ink-lg active:shadow-none",
  secondary:
    "bg-surface-container-lowest text-on-surface border border-outline-variant hover:border-outline hover:bg-surface-container-low",
  danger: "bg-error text-on-error hover:opacity-90",
  ghost: "bg-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
};

const sizeClasses: Record<Size, string> = {
  md: "h-10 px-4 text-body-md",
  lg: "h-12 px-6 text-body-lg",
};

// Every interactive control in the app should go through this component so
// height, radius, and focus states stay consistent — don't hand-roll <button>
// elements with one-off Tailwind classes elsewhere.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "rounded-md font-sans font-medium transition-all duration-200 ease-smooth",
        "active:scale-[0.97] disabled:active:scale-100",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
