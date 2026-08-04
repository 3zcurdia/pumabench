"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistogramRow {
  bucket: number;
  count: number;
  models: string[];
}

interface Props {
  data: { model: string; effort: string; correct: number }[];
}

function BucketTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: HistogramRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {row.bucket} pts
      </div>
      <div>
        Rango: <strong>{row.bucket} – {row.bucket + 1}</strong>
      </div>
      <div>
        Modelos: <strong>{row.count}</strong>
      </div>
      {row.count > 0 && (
        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          {row.models.slice(0, 5).join(", ")}
          {row.models.length > 5 && ` +${row.models.length - 5}`}
        </div>
      )}
    </div>
  );
}

export default function ScoreHistogramChart({ data }: Props) {
  const chartData: HistogramRow[] = useMemo(() => {
    const effortOrder: Record<string, number> = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
    };

    const best = new Map<string, { model: string; correct: number; effort: string }>();
    for (const row of data) {
      const existing = best.get(row.model);
      if (
        !existing ||
        (effortOrder[row.effort] ?? 99) <
          (effortOrder[existing.effort] ?? 99)
      ) {
        best.set(row.model, { model: row.model, correct: row.correct, effort: row.effort });
      }
    }

    const buckets = new Map<number, string[]>();
    for (let i = 0; i <= 120; i += 2) buckets.set(i, []);

    for (const row of best.values()) {
      const b = Math.floor(row.correct / 2) * 2;
      if (b >= 0 && b <= 120) {
        buckets.get(b)!.push(row.model);
      }
    }

    return Array.from(buckets.entries())
      .map(([bucket, models]) => ({ bucket, count: models.length, models }))
      .filter((r) => r.count > 0 || r.bucket % 10 === 0);
  }, [data]);

  return (
    <div style={{ width: "100%", height: 480 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 32, right: 48, bottom: 48, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="bucket"
            domain={[0, 120]}
            ticks={[0, 20, 40, 60, 80, 100, 120]}
            tickFormatter={(v: number) => `${v}`}
            fontSize={12}
            stroke="#0f172a"
            tickLine={false}
          />
          <YAxis
            type="number"
            fontSize={12}
            stroke="#64748b"
            allowDecimals={false}
          />
          <Tooltip
            content={<BucketTooltip />}
            cursor={{ fill: "rgba(13, 148, 136, 0.06)" }}
          />
          <Bar
            dataKey="count"
            fill="#0d9488"
            radius={[4, 4, 0, 0]}
            barSize={48}
          >
            <LabelList
              dataKey="count"
              position="top"
              fontSize={11}
              fill="#0f172a"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
