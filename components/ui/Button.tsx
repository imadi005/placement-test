import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-container",
  secondary: "bg-surface text-on-surface border border-on-surface/60 hover:bg-surface-container-low",
  danger: "bg-error text-on-error hover:opacity-90",
  ghost: "bg-transparent text-on-surface hover:bg-surface-container-low",
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
        "rounded-md font-sans font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
