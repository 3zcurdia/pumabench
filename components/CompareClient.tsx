"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import ViewToggle, { type ViewMode } from "./ViewToggle";

export interface CompareArea {
  area: number;
  area_name: string;
  percentage: number;
  correct: number;
  questions: number;
}

export interface CompareModel {
  model: string;
  overallPercentage: number;
  overallCorrect: number;
  overallQuestions: number;
  areas: CompareArea[];
}

const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#ca8a04",
];

function CompareTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const areaName = row.areaName;
  const entries = payload
    .map((p: any) => {
      const idx = Number(String(p.dataKey).slice(1));
      const pct = row[`k${idx}`];
      const correct = row[`p${idx}`];
      const questions = row[`q${idx}`];
      return { p, pct, correct, questions };
    })
    .filter((e: any) => e.pct !== undefined)
    .sort((a: any, b: any) => Number(b.pct) - Number(a.pct));
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {label}
        {areaName ? ` — ${areaName}` : ""}
      </div>
      {entries.map((e: any) => (
        <div key={String(e.p.dataKey)} style={{ color: e.p.fill }}>
          {e.p.name}: <strong>{Number(e.pct).toFixed(1)}%</strong> (
          {e.correct}/{e.questions})
        </div>
      ))}
    </div>
  );
}

function CompareInner({ models }: { models: CompareModel[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ViewMode>("percentage");
  const isPoints = mode === "points";

  const byName = useMemo(
    () => new Map(models.map((m) => [m.model, m])),
    [models],
  );

  const param = searchParams.get("models");
  const selectedNames =
    param === null
      ? models.slice(0, 3).map((m) => m.model)
      : param.split(",").filter(Boolean);
  const selected = selectedNames
    .map((name) => byName.get(name))
    .filter((m): m is CompareModel => Boolean(m));

  const toggle = (name: string) => {
    const names = new Set(selected.map((m) => m.model));
    if (names.has(name)) names.delete(name);
    else names.add(name);
    const query = [...names].join(",");
    router.replace(
      query ? `${pathname}?models=${encodeURIComponent(query)}` : pathname,
      { scroll: false },
    );
  };

  const areaNumbers = [
    ...new Set(selected.flatMap((m) => m.areas.map((a) => a.area))),
  ].sort((a, b) => a - b);

  const chartRows = areaNumbers.map((area) => {
    const sample = selected
      .map((m) => m.areas.find((a) => a.area === area))
      .find(Boolean);
    const row: Record<string, string | number> = {
      areaLabel: `Área ${area}`,
      areaName: sample?.area_name ?? "",
    };
    selected.forEach((m, i) => {
      const a = m.areas.find((x) => x.area === area);
      if (a) {
        row[`k${i}`] = a.percentage;
        row[`p${i}`] = a.correct;
        row[`q${i}`] = a.questions;
      }
    });
    return row;
  });

  const maxCorrect = Math.max(
    1,
    ...chartRows.flatMap((row) =>
      selected
        .map((_, i) => row[`p${i}`])
        .filter((v): v is string | number => v !== undefined)
        .map(Number),
    ),
  );

  const rowBest = (area: number) =>
    Math.max(
      ...selected.map(
        (m) => m.areas.find((a) => a.area === area)?.percentage ?? -1,
      ),
    );

  return (
    <>
      <section className="card">
        <h2 className="card-title">Models</h2>
        <div className="selector-grid">
          {models.map((m) => {
            const idx = selected.findIndex((s) => s.model === m.model);
            const checked = idx >= 0;
            return (
              <label
                key={m.model}
                className={`checkbox-item${checked ? " checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.model)}
                />
                {checked && (
                  <span
                    className="color-dot"
                    style={{ background: PALETTE[idx % PALETTE.length] }}
                  />
                )}
                <span className="checkbox-name">{m.model}</span>
                <span className="muted">{m.overallPercentage.toFixed(1)}%</span>
              </label>
            );
          })}
        </div>
      </section>

      {selected.length < 2 ? (
        <p className="muted">Select at least 2 models to compare.</p>
      ) : (
        <>
          <section className="card">
            <div className="chart-card-head">
              <h2 className="card-title">Average score per area</h2>
              <ViewToggle value={mode} onChange={setMode} />
            </div>
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartRows}
                  margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
                  barCategoryGap="24%"
                  barGap={3}
                >
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="areaLabel"
                    fontSize={12}
                    stroke="#0f172a"
                    tickLine={false}
                  />
                  <YAxis
                    domain={isPoints ? [0, maxCorrect] : [0, 100]}
                    tickFormatter={
                      isPoints
                        ? (v: number) => `${Math.round(v)}`
                        : (v: number) => `${v}%`
                    }
                    allowDecimals={!isPoints}
                    fontSize={12}
                    stroke="#64748b"
                    width={48}
                  />
                  <Tooltip
                    content={<CompareTooltip />}
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  />
                  {selected.map((m, i) => (
                    <Bar
                      key={m.model}
                      dataKey={isPoints ? `p${i}` : `k${i}`}
                      name={m.model}
                      fill={PALETTE[i % PALETTE.length]}
                      radius={[3, 3, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Side-by-side table</h2>
            <div className="table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    {selected.map((m, i) => (
                      <th key={m.model} className="num">
                        <span
                          className="color-dot"
                          style={{
                            background: PALETTE[i % PALETTE.length],
                          }}
                        />
                        {m.model}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areaNumbers.map((area) => {
                    const sample = selected
                      .map((m) => m.areas.find((a) => a.area === area))
                      .find(Boolean);
                    const best = rowBest(area);
                    return (
                      <tr key={area}>
                        <td>
                          <strong>Área {area}</strong>
                          <div className="muted area-sub">
                            {sample?.area_name}
                          </div>
                        </td>
                        {selected.map((m) => {
                          const a = m.areas.find((x) => x.area === area);
                          if (!a) return <td key={m.model} className="num">—</td>;
                          const isBest = a.percentage === best;
                          return (
                            <td
                              key={m.model}
                              className={`num${isBest ? " best" : ""}`}
                            >
                              {a.percentage.toFixed(1)}% ({a.correct}/
                              {a.questions})
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="avg-row">
                    <td>
                      <strong>Average</strong>
                    </td>
                    {selected.map((m) => {
                      const best = Math.max(
                        ...selected.map((s) => s.overallPercentage),
                      );
                      const isBest = m.overallPercentage === best;
                      return (
                        <td
                          key={m.model}
                          className={`num${isBest ? " best" : ""}`}
                        >
                          <strong>{m.overallPercentage.toFixed(1)}%</strong> (
                          {m.overallCorrect}/{m.overallQuestions})
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function CompareClient({ models }: { models: CompareModel[] }) {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <CompareInner models={models} />
    </Suspense>
  );
}
