"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EffortBadge from "./EffortBadge";
import ViewToggle, { type ViewMode } from "./ViewToggle";

export interface OverviewRow {
  model: string;
  effort: string;
  percentage: number;
  correct: number;
  questions: number;
}

function ModelTick({ x, y, payload }: any) {
  const row = payload?.payload;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="middle"
      fontSize={12}
      fill="#0f172a"
      transform={`rotate(-35, ${x}, ${y})`}
    >
      {row?.model}
    </text>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: OverviewRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {row.model}
        <EffortBadge effort={row.effort} />
      </div>
      <div>
        Score: <strong>{Math.floor(row.percentage)}%</strong>
      </div>
      <div>
        Puntos: {row.correct}
      </div>
      <div className="muted">Promedio de las 4 calificaciones por área</div>
    </div>
  );
}

export default function OverviewChart({
  data,
  title,
}: {
  data: OverviewRow[];
  title?: string;
}) {
  const [mode, setMode] = useState<ViewMode>("percentage");
  const isPoints = mode === "points";
  const maxQuestions = Math.max(1, ...data.map((r) => r.questions));
  const height = 480;

  const chart = (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 32, right: 8, bottom: 72, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis
            type="category"
            dataKey="model"
            fontSize={12}
            stroke="#0f172a"
            interval={0}
            tickLine={false}
            tick={<ModelTick />}
          />
          <YAxis
            type="number"
            domain={isPoints ? [0, maxQuestions] : [0, 100]}
            tickFormatter={
              isPoints
                ? (v: number) => `${Math.floor(v)}`
                : (v: number) => `${v}%`
            }
            allowDecimals={!isPoints}
            fontSize={12}
            stroke="#64748b"
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
          />
          {isPoints ? (
            <ReferenceLine
              y={114}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "Medicina (114 pts)", position: "right", fill: "#ef4444", fontSize: 12 }}
            />
          ) : (
            <ReferenceLine
              y={80}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "80%", position: "right", fill: "#ef4444", fontSize: 12 }}
            />
          )}
          {isPoints ? (
            <ReferenceLine
              y={89}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "Derecho (89 pts)", position: "right", fill: "#ef4444", fontSize: 12 }}
            />
          ) : null}
          <Bar
            dataKey={isPoints ? "correct" : "percentage"}
            fill="#2563eb"
            radius={[4, 4, 0, 0]}
            barSize={40}
          >
            <LabelList
              dataKey={isPoints ? "correct" : "percentage"}
              position="top"
              formatter={(v: number, entry: any) =>
                isPoints
                  ? `${Math.floor(v)}`
                  : `${Math.floor(v)}%`
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
        <ViewToggle value={mode} onChange={setMode} />
      </div>
      {chart}
    </>
  );
}
