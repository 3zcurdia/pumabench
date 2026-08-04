"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { CompareModel } from "./CompareClient";

const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#ca8a04",
];

interface SubjectRow {
  [key: string]: string | number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entries = [...payload]
    .map((p: any) => ({
      name: p.name as string,
      pct: Number(p.value),
      stroke: p.stroke as string,
    }))
    .filter((e) => !Number.isNaN(e.pct))
    .sort((a, b) => b.pct - a.pct);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {entries.map((e) => (
        <div key={e.name} style={{ color: e.stroke }}>
          {e.name}: <strong>{e.pct.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

export default function CompareSubjectsRadarChart({
  subjectChartRows,
  selected,
}: {
  subjectChartRows: SubjectRow[];
  selected: CompareModel[];
}) {
  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <RechartsRadarChart
          cx="50%"
          cy="50%"
          outerRadius="70%"
          data={subjectChartRows}
        >
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 11, fill: "#0f172a" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v: number) => `${v}%`}
          />
          {selected.map((m, i) => (
            <Radar
              key={m.modelKey}
              name={m.model}
              dataKey={`k${i}`}
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Tooltip content={<ChartTooltip />} />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
