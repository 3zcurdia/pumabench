"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { effortColor } from "@/lib/effort-colors";
import ViewToggle, { type ViewMode } from "./ViewToggle";

export interface AreaChartValue {
  percentage: number;
  correct: number;
  questions: number;
}

export interface AreaChartRow {
  area: string;
  areaName: string;
  values: Record<string, AreaChartValue>;
}

interface ChartRow {
  area: string;
  areaName: string;
  values: Record<string, AreaChartValue>;
  [effortKey: string]: string | number | Record<string, AreaChartValue>;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: ChartRow = payload[0].payload;
  const entries: {
    effort: string;
    pct: number;
    fill: string;
    meta?: { percentage: number; correct: number; questions: number };
  }[] = payload
    .map((p: any) => ({
      effort: p.name as string,
      pct: Number(p.value),
      fill: p.fill,
      meta: row.values[p.name],
    }))
    .filter(
      (e: { pct: number }) => Number.isFinite(e.pct),
    )
    .sort(
      (a: { pct: number }, b: { pct: number }) => b.pct - a.pct,
    );
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{row.area}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {row.areaName}
      </div>
      {entries.map((e) => (
        <div key={e.effort} style={{ color: e.fill }}>
          {e.effort}: <strong>{e.pct.toFixed(1)}%</strong>
          {e.meta ? ` (${e.meta.correct}/${e.meta.questions})` : ""}
        </div>
      ))}
    </div>
  );
}

export default function AreasChart({
  data,
  efforts,
  title,
}: {
  data: AreaChartRow[];
  efforts: string[];
  title?: string;
}) {
  const [mode, setMode] = useState<ViewMode>("percentage");
  const isPoints = mode === "points";

  const chartData: ChartRow[] = data.map((row) => {
    const flat: ChartRow = { area: row.area, areaName: row.areaName, values: row.values };
    for (const effort of efforts) {
      const v = row.values[effort];
      flat[effort] = isPoints ? (v?.correct ?? 0) : (v?.percentage ?? 0);
    }
    return flat;
  });

  const maxQuestions = Math.max(
    1,
    ...data.flatMap((r) =>
      efforts.map((e) => r.values[e]?.questions ?? 0),
    ),
  );
  const height = Math.max(200, data.length * 64 + 40);

  const chart = (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
          barCategoryGap="20%"
          barGap={2}
        >
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={isPoints ? [0, maxQuestions] : [0, 100]}
            tickFormatter={
              isPoints ? (v: number) => `${Math.round(v)}` : (v: number) => `${v}%`
            }
            allowDecimals={!isPoints}
            fontSize={12}
            stroke="#64748b"
          />
          <YAxis
            type="category"
            dataKey="area"
            width={80}
            fontSize={12}
            stroke="#0f172a"
            interval={0}
            tickLine={false}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
          />
          {efforts.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              formatter={(value: string) => (
                <span style={{ color: "#0f172a" }}>{value}</span>
              )}
            />
          )}
          {efforts.map((effort) => (
            <Bar
              key={effort}
              dataKey={effort}
              name={effort}
              fill={effortColor(effort)}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (!title) return chart;

  return (
    <>
      <div className="chart-card-head">
        <h2 className="card-title">{title}</h2>
        <ViewToggle value={mode} onChange={setMode} />
      </div>
      {chart}
    </>
  );
}
