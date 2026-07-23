"use client";

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
import EffortBadge from "./EffortBadge";

export interface SubjectRankRow {
  model: string;
  effort: string;
  percentage: number;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: SubjectRankRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {row.model}
        <EffortBadge effort={row.effort} />
      </div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

export default function SubjectRankingsChart({
  data,
  title,
}: {
  data: SubjectRankRow[];
  title: string;
}) {
  const sorted = [...data].sort((a, b) => b.percentage - a.percentage);
  const height = Math.max(200, sorted.length * 38 + 40);

  return (
    <>
      <div className="chart-card-head">
        <h3 className="card-title">{title}</h3>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              fontSize={12}
              stroke="#64748b"
            />
            <YAxis
              type="category"
              dataKey="model"
              width={240}
              fontSize={12}
              stroke="#0f172a"
              interval={0}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "rgba(124, 58, 237, 0.06)" }}
            />
            <Bar
              dataKey="percentage"
              fill="#7c3aed"
              radius={[0, 4, 4, 0]}
              barSize={28}
            >
              <LabelList
                dataKey="percentage"
                position="right"
                formatter={(v: number) => `${v.toFixed(1)}%`}
                fontSize={12}
                fill="#0f172a"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
