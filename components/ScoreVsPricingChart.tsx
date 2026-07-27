"use client";

import { useCallback, useRef, useState } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EffortBadge from "./EffortBadge";

export interface PricingRow {
  model: string;
  effort: string;
  pricePer1M: number;
  percentage: number;
}

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: PricingRow = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {row.model}
        <EffortBadge effort={row.effort} />
      </div>
      <div>
        Precio (prompt, 1M tokens): <strong>{formatPrice(row.pricePer1M)}</strong>
      </div>
      <div>
        Score: <strong>{row.percentage.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

export default function ScoreVsPricingChart({ data }: { data: PricingRow[] }) {
  const prices = data.map((d) => d.pricePer1M);
  const fullMinP = Math.min(...prices);
  const fullMaxP = Math.max(...prices);
  const pad = (fullMaxP - fullMinP) * 0.08 || 0.01;

  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [xDomain, setXDomain] = useState<[number, number]>([fullMinP - pad, fullMaxP + pad]);
  const [yDomain, setYDomain] = useState<[number, number]>([0, 100]);
  const [zoomed, setZoomed] = useState(false);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: any) => {
    if (e?.activePayload?.[0]) {
      const val = e.activePayload[0].payload.pricePer1M;
      setRefAreaLeft(String(val));
      dragging.current = true;
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (dragging.current && e?.activePayload?.[0]) {
      const val = e.activePayload[0].payload.pricePer1M;
      setRefAreaRight(String(val));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    if (!refAreaLeft || !refAreaRight) return;

    let left = Number(refAreaLeft);
    let right = Number(refAreaRight);
    if (left > right) [left, right] = [right, left];
    if (right - left < 0.001) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    const filtered = data.filter((d) => d.pricePer1M >= left && d.pricePer1M <= right);
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
        <h2 className="card-title">Score vs Precio (prompt)</h2>
        {zoomed && (
          <button className="zoom-reset" onClick={handleReset}>
            Restablecer zoom
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -10, marginBottom: 12, fontSize: 13 }}>
        Haz clic y arrastra para acercar — precio por 1M tokens
      </p>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <ScatterChart
            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <CartesianGrid stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="pricePer1M"
              name="Precio"
              domain={xDomain}
              tickFormatter={formatPrice}
              fontSize={12}
              stroke="#64748b"
              label={{
                value: "Precio (prompt, 1M tokens)",
                position: "insideBottom",
                offset: -2,
                fontSize: 12,
                fill: "#64748b",
              }}
            />
            <YAxis
              type="number"
              dataKey="percentage"
              name="Score"
              domain={yDomain}
              tickFormatter={(v: number) => `${v}%`}
              fontSize={12}
              stroke="#64748b"
              label={{
                value: "Score %",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fontSize: 12,
                fill: "#64748b",
              }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ strokeDasharray: "3 3", stroke: "#94a3b8" }}
            />
            <Scatter data={data} fill="#2563eb" r={6} />
            {refAreaLeft && refAreaRight && (
              <ReferenceArea
                x1={Number(refAreaLeft)}
                x2={Number(refAreaRight)}
                strokeOpacity={0.3}
                fill="#2563eb"
                fillOpacity={0.15}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
