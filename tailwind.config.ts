import type { Config } from "tailwindcss";

// Design tokens lifted from the "Academic Precision" design system
// (terracotta / cream / charcoal, Literata + Inter). Keep this file as the
// single source of truth for color/type/spacing — components should never
// hardcode hex values, only these token names.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#fff8f5",
        "surface-dim": "#e0d8d5",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#faf2ee",
        "surface-container": "#f4ece8",
        "surface-container-high": "#eee7e3",
        "on-surface": "#1e1b19",
        "on-surface-variant": "#55433a",
        outline: "#887368",
        "outline-variant": "#e7e0d8",
        primary: "#96440f",
        "on-primary": "#ffffff",
        "primary-container": "#b55c26",
        secondary: "#4e635a",
        "secondary-container": "#cee5da",
        "on-secondary-container": "#0b3b2b",
        tertiary: "#735c00",
        "tertiary-container": "#e9c349",
        "on-tertiary-container": "#4f3e00",
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        background: "#fff8f5",
        "on-background": "#1e1b19",
      },
      fontFamily: {
        serif: ["Literata", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "display-lg-mobile": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "500" }],
        "score-xl": ["64px", { lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "28px" }],
        "body-md": ["16px", { lineHeight: "24px" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      boxShadow: {
        "soft-ink": "0 4px 12px rgba(28, 25, 23, 0.05)",
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
    },
  },
  plugins: [],
};

export default config;
