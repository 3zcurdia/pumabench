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
import EffortBadge from "./EffortBadge";
import ViewToggle, { type ViewMode } from "./ViewToggle";

export interface CompareArea {
  area: number;
  area_name: string;
  percentage: number;
  correct: number;
  questions: number;
}

export interface CompareModel {
  modelKey: string;
  model: string;
  effort: string;
  overallPercentage: number;
  overallCorrect: number;
  overallQuestions: number;
  areas: CompareArea[];
  subjects: Record<string, number>;
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
      const effort = row[`e${idx}`];
      return { p, pct, correct, questions, effort };
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
          {e.p.name}
          {e.effort ? <EffortBadge effort={e.effort} /> : null}:{" "}
          <strong>{Number(e.pct).toFixed(1)}%</strong> (
          {e.correct}/{e.questions})
        </div>
      ))}
    </div>
  );
}

function SubjectCompareTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entries = [...payload]
    .map((p: any) => {
      const idx = Number(String(p.dataKey).slice(1));
      return { p, pct: Number(p.value), effort: payload[0]?.payload?.[`e${idx}`] };
    })
    .filter((e: any) => !Number.isNaN(e.pct))
    .sort((a: any, b: any) => b.pct - a.pct);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {entries.map((e: any) => (
        <div key={String(e.p.dataKey)} style={{ color: e.p.fill }}>
          {e.p.name}
          {e.effort ? <EffortBadge effort={e.effort} /> : null}:{" "}
          <strong>{e.pct.toFixed(1)}%</strong>
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

  const byKey = useMemo(
    () => new Map(models.map((m) => [m.modelKey, m])),
    [models],
  );

  const param = searchParams.get("models");
  const selectedKeys =
    param === null
      ? models.slice(0, 3).map((m) => m.modelKey)
      : param.split(",").filter(Boolean);
  const selected = selectedKeys
    .map((key) => byKey.get(key))
    .filter((m): m is CompareModel => Boolean(m));

  const toggle = (key: string) => {
    const keys = new Set(selected.map((m) => m.modelKey));
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    const query = [...keys].join(",");
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
        row[`e${i}`] = m.effort;
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

  const subjectNames = [
    ...new Set(selected.flatMap((m) => Object.keys(m.subjects))),
  ];

  const subjectChartRows = subjectNames.map((subject) => {
    const row: Record<string, string | number> = { subject };
    selected.forEach((m, i) => {
      const pct = m.subjects[subject];
      if (pct !== undefined) {
        row[`k${i}`] = pct;
        row[`e${i}`] = m.effort;
      }
    });
    return row;
  });

  const subjectRowBest = (subject: string) =>
    Math.max(
      ...selected.map((m) => m.subjects[subject] ?? -1),
    );

  return (
    <>
      <section className="card">
        <h2 className="card-title">Models</h2>
        <div className="selector-grid">
          {models.map((m) => {
            const idx = selected.findIndex((s) => s.modelKey === m.modelKey);
            const checked = idx >= 0;
            return (
              <label
                key={m.modelKey}
                className={`checkbox-item${checked ? " checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.modelKey)}
                />
                {checked && (
                  <span
                    className="color-dot"
                    style={{ background: PALETTE[idx % PALETTE.length] }}
                  />
                )}
                <span className="checkbox-name">{m.model}</span>
                <EffortBadge effort={m.effort} />
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
                      key={m.modelKey}
                      dataKey={isPoints ? `p${i}` : `k${i}`}
                      name={`${m.model} [${m.effort}]`}
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
                      <th key={m.modelKey} className="num">
                        <span
                          className="color-dot"
                          style={{
                            background: PALETTE[i % PALETTE.length],
                          }}
                        />
                        {m.model}
                        <EffortBadge effort={m.effort} />
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
                          if (!a) return <td key={m.modelKey} className="num">—</td>;
                          const isBest = a.percentage === best;
                          return (
                            <td
                              key={m.modelKey}
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
                          key={m.modelKey}
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

          <section className="card">
            <h2 className="card-title">Score per subject</h2>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <BarChart
                  data={subjectChartRows}
                  margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
                  barCategoryGap="24%"
                  barGap={3}
                >
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="subject"
                    fontSize={12}
                    stroke="#0f172a"
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    fontSize={12}
                    stroke="#64748b"
                    width={48}
                  />
                  <Tooltip
                    content={<SubjectCompareTooltip />}
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  />
                  {selected.map((m, i) => (
                    <Bar
                      key={m.modelKey}
                      dataKey={`k${i}`}
                      name={`${m.model} [${m.effort}]`}
                      fill={PALETTE[i % PALETTE.length]}
                      radius={[3, 3, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Side-by-side table (per subject)</h2>
            <div className="table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {selected.map((m, i) => (
                      <th key={m.modelKey} className="num">
                        <span
                          className="color-dot"
                          style={{
                            background: PALETTE[i % PALETTE.length],
                          }}
                        />
                        {m.model}
                        <EffortBadge effort={m.effort} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjectNames.map((subject) => {
                    const best = subjectRowBest(subject);
                    return (
                      <tr key={subject}>
                        <td>
                          <strong>{subject}</strong>
                        </td>
                        {selected.map((m) => {
                          const pct = m.subjects[subject];
                          if (pct === undefined)
                            return <td key={m.modelKey} className="num">—</td>;
                          const isBest = pct === best;
                          return (
                            <td
                              key={m.modelKey}
                              className={`num${isBest ? " best" : ""}`}
                            >
                              {pct.toFixed(1)}%
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
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
