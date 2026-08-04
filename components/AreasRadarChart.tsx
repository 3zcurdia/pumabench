"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { effortColor } from "@/lib/effort-colors";

export interface RadarAreaPoint {
  area: string;
  percentage: number;
  correct: number;
  questions: number;
}

export interface AreaRadarSeries {
  effort: string;
  points: RadarAreaPoint[];
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const label = payload[0]?.payload?.area ?? "";
  const entries: { name: string; pct: number; fill: string }[] = payload
    .map((p: any) => ({
      name: p.name as string,
      pct: Number(p.value),
      fill: p.fill ?? p.stroke,
    }))
    .filter((e: { name: string; pct: number; fill: string }) =>
      Number.isFinite(e.pct),
    )
    .sort(
      (a: { pct: number }, b: { pct: number }) => b.pct - a.pct,
    );
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {entries.map((e) => (
        <div key={e.name} style={{ color: e.fill }}>
          {e.name}: <strong>{e.pct.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

export default function AreasRadarChart({
  series,
}: {
  series: AreaRadarSeries[];
}) {
  if (series.length === 0) return null;
  const first = series[0].points;
  const data = first.map((point, i) => {
    const row: Record<string, string | number> = { area: point.area };
    for (const s of series) {
      row[`effort:${s.effort}`] = s.points[i]?.percentage ?? 0;
    }
    return row;
  });

  const showLegend = series.length > 1;

  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="area"
            tick={{ fontSize: 12, fill: "#0f172a" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v: number) => `${v}%`}
          />
          {series.map((s) => (
            <Radar
              key={s.effort}
              name={s.effort}
              dataKey={`effort:${s.effort}`}
              stroke={effortColor(s.effort)}
              fill={effortColor(s.effort)}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Tooltip content={<ChartTooltip />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
