const LABELS: Record<string, string> = {
  none: "none",
  low: "low",
  medium: "medium",
  high: "high",
};

export default function EffortBadge({ effort }: { effort: string }) {
  return (
    <span className={`effort-badge effort-${effort}`}>
      {LABELS[effort] ?? effort}
    </span>
  );
}
