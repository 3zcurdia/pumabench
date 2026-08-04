export const EFFORT_COLORS: Record<string, string> = {
  none: "#64748b",
  low: "#15803d",
  medium: "#2563eb",
  high: "#dc2626",
};

export const EFFORT_COLOR_FALLBACK = "#94a3b8";

export function effortColor(effort: string): string {
  return EFFORT_COLORS[effort] ?? EFFORT_COLOR_FALLBACK;
}
