import type { Config } from "tailwindcss";

// Design tokens for the "Petrol & Brass" design system — deep teal-emerald
// and warm brass on an ivory neutral base, Fraunces + Inter. Deliberately
// avoids the indigo-on-cool-gray look every AI-generated SaaS UI defaults
// to. Keep this file as the single source of truth for color/type/spacing —
// components should never hardcode hex values, only these token names.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#faf8f3",
        "surface-dim": "#e8e2d3",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#fdfbf7",
        "surface-container": "#f3efe4",
        "surface-container-high": "#ece5d5",
        "on-surface": "#1c1b17",
        "on-surface-variant": "#5f594c",
        outline: "#bfb5a0",
        "outline-variant": "#e4ddc9",
        primary: "#0f5c52",
        "on-primary": "#ffffff",
        "primary-container": "#0b453e",
        secondary: "#4d7c3f",
        "secondary-container": "#dbe8d3",
        "on-secondary-container": "#1f3d1a",
        tertiary: "#9c6b0b",
        "tertiary-container": "#f5e3b3",
        "on-tertiary-container": "#553a04",
        error: "#ae2e24",
        "on-error": "#ffffff",
        "error-container": "#f9dedc",
        "on-error-container": "#5c130d",
        background: "#faf8f3",
        "on-background": "#1c1b17",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg-mobile": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "score-xl": ["64px", { lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "28px" }],
        "body-md": ["16px", { lineHeight: "24px" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "0.625rem",
        md: "0.875rem",
        lg: "1.25rem",
        xl: "1.75rem",
      },
      boxShadow: {
        "soft-ink": "0 1px 2px rgba(28, 27, 23, 0.05), 0 12px 28px -8px rgba(15, 92, 82, 0.18)",
        "soft-ink-lg": "0 4px 8px rgba(28, 27, 23, 0.05), 0 24px 48px -12px rgba(15, 92, 82, 0.24)",
        glow: "0 0 0 4px rgba(15, 92, 82, 0.14)",
      },
      spacing: {
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "32px",
        gutter: "24px",
      },
      maxWidth: {
        container: "1120px",
        "test-column": "720px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
