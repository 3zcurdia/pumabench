"use client";

export type ViewMode = "percentage" | "points";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="Chart view">
      <button
        type="button"
        className={value === "percentage" ? "active" : ""}
        aria-pressed={value === "percentage"}
        onClick={() => onChange("percentage")}
      >
        Percentage
      </button>
      <button
        type="button"
        className={value === "points" ? "active" : ""}
        aria-pressed={value === "points"}
        onClick={() => onChange("points")}
      >
        Points
      </button>
    </div>
  );
}
