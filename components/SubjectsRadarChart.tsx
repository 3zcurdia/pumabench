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

export interface RadarSubjectRow {
  subject: string;
  percentage: number;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: RadarSubjectRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{row.subject}</div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

export default function SubjectsRadarChart({
  data,
}: {
  data: RadarSubjectRow[];
}) {
  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
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
          <Radar
            name="Score"
            dataKey="percentage"
            stroke="#7c3aed"
            fill="#7c3aed"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip content={<ChartTooltip />} />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
