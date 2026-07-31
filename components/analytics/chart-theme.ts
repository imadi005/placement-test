// Fixed categorical order — reuses the app's own design tokens so charts
// read as part of the same system, not a bolted-on library default. Never
// cycle/reassign these per-render; a given key always gets the same color.
export const CATEGORICAL_COLORS = ["#0f5c52", "#9c6b0b", "#4d7c3f", "#ae2e24", "#5f594c"];

export const CHART_GRID = "#e4ddc9"; // outline-variant
export const CHART_AXIS = "#5f594c"; // on-surface-variant
export const CHART_TEXT_FONT = "Inter, ui-sans-serif, system-ui";

export const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e4ddc9",
  background: "#ffffff",
  fontFamily: CHART_TEXT_FONT,
  fontSize: 13,
  boxShadow: "0 12px 28px -8px rgba(15, 92, 82, 0.18)",
};

export const axisTick = { fill: CHART_AXIS, fontFamily: CHART_TEXT_FONT, fontSize: 12 };
