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

export interface AreaRankRow {
  model: string;
  percentage: number;
  correct: number;
  questions: number;
}

function ChartTooltip({
  active,
  payload,
  areaName,
}: {
  active?: boolean;
  payload?: any[];
  areaName: string;
}) {
  if (!active || !payload?.length) return null;
  const row: AreaRankRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{row.model}</div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
      <div>
        Points: {row.correct}/{row.questions}
      </div>
      <div className="muted">{areaName}</div>
    </div>
  );
}

export default function AreaRankingsChart({
  data,
  areaName,
  title,
}: {
  data: AreaRankRow[];
  areaName: string;
  title: string;
}) {
  const sorted = [...data].sort((a, b) => b.percentage - a.percentage);
  const height = Math.max(220, sorted.length * 40 + 40);

  return (
    <>
      <div className="chart-card-head">
        <h3 className="card-title">{title}</h3>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        {areaName}
      </p>
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
              content={<ChartTooltip areaName={areaName} />}
              cursor={{ fill: "rgba(13, 148, 136, 0.06)" }}
            />
            <Bar
              dataKey="percentage"
              fill="#0d9488"
              radius={[0, 4, 4, 0]}
              barSize={32}
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
