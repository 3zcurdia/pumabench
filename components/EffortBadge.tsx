const LABELS: Record<string, string> = {
  none: "none",
  low: "low",
  medium: "medium",
  high: "high",
};

export default function EffortBadge({
  effort,
  className,
}: {
  effort: string;
  className?: string;
}) {
  return (
    <span
      className={`effort-badge effort-${effort}${className ? ` ${className}` : ""}`}
    >
      {LABELS[effort] ?? effort}
    </span>
  );
}
