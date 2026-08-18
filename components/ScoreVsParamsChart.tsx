"use client";

import { useCallback, useRef, useState } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EffortBadge from "./EffortBadge";

export interface ScatterRow {
  model: string;
  effort: string;
  parameters: number;
  percentage: number;
  open: boolean;
}

function formatParams(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${n}`;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: ScatterRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {row.model}
        <EffortBadge effort={row.effort} />
      </div>
      <div>
        Parámetros: <strong>{formatParams(row.parameters)}</strong>
      </div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

export default function ScoreVsParamsChart({ data }: { data: ScatterRow[] }) {
  const params = data.map((d) => d.parameters);
  const fullMinP = Math.min(...params);
  const fullMaxP = Math.max(...params);
  const pad = (fullMaxP - fullMinP) * 0.08 || 1e9;

  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [xDomain, setXDomain] = useState<[number, number]>([fullMinP - pad, fullMaxP + pad]);
  const [yDomain, setYDomain] = useState<[number, number]>([0, 100]);
  const [zoomed, setZoomed] = useState(false);
  const dragging = useRef(false);

  const visibleData = zoomed
    ? data.filter((d) => d.parameters >= xDomain[0] && d.parameters <= xDomain[1])
    : data;
  const openData = visibleData.filter((d) => d.open);
  const closedData = visibleData.filter((d) => !d.open);

  const handleMouseDown = useCallback((e: any) => {
    if (e?.activePayload?.[0]) {
      const val = e.activePayload[0].payload.parameters;
      setRefAreaLeft(String(val));
      dragging.current = true;
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (dragging.current && e?.activePayload?.[0]) {
      const val = e.activePayload[0].payload.parameters;
      setRefAreaRight(String(val));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    if (!refAreaLeft || !refAreaRight) return;

    let left = Number(refAreaLeft);
    let right = Number(refAreaRight);
    if (left > right) [left, right] = [right, left];
    if (right - left < 1e6) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    const filtered = data.filter((d) => d.parameters >= left && d.parameters <= right);
    const yVals = filtered.map((d) => d.percentage);
    const yMin = Math.max(0, Math.floor(Math.min(...yVals) / 5) * 5 - 5);
    const yMax = Math.min(100, Math.ceil(Math.max(...yVals) / 5) * 5 + 5);

    setXDomain([left, right]);
    setYDomain([yMin, yMax]);
    setZoomed(true);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, data]);

  const handleReset = useCallback(() => {
    setXDomain([fullMinP - pad, fullMaxP + pad]);
    setYDomain([0, 100]);
    setZoomed(false);
  }, [fullMinP, fullMaxP, pad]);

  return (
    <>
      <div className="chart-card-head">
        <h2 className="card-title">Score vs Parámetros</h2>
        {zoomed && (
          <button className="zoom-reset" onClick={handleReset}>
            Restablecer zoom
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -10, marginBottom: 12, fontSize: 13 }}>
        Haz clic y arrastra para acercar
      </p>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          Abierto
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--chart-axis)", display: "inline-block" }} />
          Cerrado
        </span>
      </div>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <ScatterChart
            margin={{ top: 32, right: 24, bottom: 8, left: 8 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis
              type="number"
              dataKey="parameters"
              name="Parámetros"
              domain={xDomain}
              tickFormatter={formatParams}
              fontSize={12}
              stroke="var(--chart-axis)"
              label={{
                value: "Parámetros",
                position: "insideBottom",
                offset: -2,
                fontSize: 12,
                fill: "var(--chart-axis)",
              }}
            />
            <YAxis
              type="number"
              dataKey="percentage"
              name="Score"
              domain={yDomain}
              tickFormatter={(v: number) => `${v}%`}
              fontSize={12}
              stroke="var(--chart-axis)"
              label={{
                value: "Score %",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fontSize: 12,
                fill: "var(--chart-axis)",
              }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ strokeDasharray: "3 3", stroke: "var(--chart-axis)" }}
            />
            <ReferenceLine
              x={27e9}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "27B", position: "top", fill: "#ef4444", fontSize: 12 }}
            />
            <ReferenceLine
              x={96e9}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "96B", position: "top", fill: "#ef4444", fontSize: 12 }}
            />
            <ReferenceLine
              x={192e9}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: "192B", position: "top", fill: "#ef4444", fontSize: 12 }}
            />
            <Scatter data={openData} fill="var(--accent)" r={6} name="Abierto" />
            <Scatter data={closedData} fill="var(--chart-axis)" r={6} name="Cerrado" />
            {refAreaLeft && refAreaRight && (
              <ReferenceArea
                x1={Number(refAreaLeft)}
                x2={Number(refAreaRight)}
                strokeOpacity={0.3}
                fill="var(--accent)"
                fillOpacity={0.15}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
