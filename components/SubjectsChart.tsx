"use client";

import { type ReactNode } from "react";
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

export interface SubjectRow {
  subject: string;
  percentage: number;
  correct: number;
  questions: number;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: SubjectRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{row.subject}</div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
      <div>
        Points: {row.correct}
      </div>
    </div>
  );
}

export default function SubjectsChart({
  data,
  title,
}: {
  data: SubjectRow[];
  title?: ReactNode;
}) {
  const safeData = data.filter(
    (r) => Number.isFinite(r.correct) && Number.isFinite(r.questions) && Number.isFinite(r.percentage),
  );
  const height = Math.max(200, safeData.length * 38 + 40);

  const chart = (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={safeData}
          layout="vertical"
          margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            allowDecimals={false}
            fontSize={12}
            stroke="#64748b"
          />
          <YAxis
            type="category"
            dataKey="subject"
            width={150}
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
  );

  if (!title) return chart;

  return (
    <>
      <div className="chart-card-head">
        <h2 className="card-title">{title}</h2>
      </div>
      {chart}
    </>
  );
}
