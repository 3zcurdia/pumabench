"use client";

import { useState, type ReactNode } from "react";
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
import ViewToggle, { type ViewMode } from "./ViewToggle";

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
  chip,
}: {
  data: SubjectRow[];
  title?: ReactNode;
  chip?: ReactNode;
}) {
  const [mode, setMode] = useState<ViewMode>("percentage");
  const isPoints = mode === "points";
  const maxQuestions = Math.max(1, ...data.map((r) => r.questions));
  const height = Math.max(200, data.length * 38 + 40);

  const chart = (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={isPoints ? [0, maxQuestions] : [0, 100]}
            tickFormatter={
              isPoints
                ? (v: number) => `${Math.round(v)}`
                : (v: number) => `${v}%`
            }
            allowDecimals={!isPoints}
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
            dataKey={isPoints ? "correct" : "percentage"}
            fill="#7c3aed"
            radius={[0, 4, 4, 0]}
            barSize={18}
          >
            <LabelList
              dataKey={isPoints ? "correct" : "percentage"}
              position="right"
              formatter={(v: number, entry: any) =>
                isPoints
                  ? `${v}`
                  : `${v.toFixed(1)}%`
              }
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
        <div className="chart-card-actions">
          {chip}
          <ViewToggle value={mode} onChange={setMode} />
        </div>
      </div>
      {chart}
    </>
  );
}
