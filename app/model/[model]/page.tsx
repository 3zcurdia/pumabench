import Link from "next/link";
import { notFound } from "next/navigation";
import AreasChart from "@/components/AreasChart";
import AreasRadarChart, {
  type AreaRadarSeries,
} from "@/components/AreasRadarChart";
import EffortBadge from "@/components/EffortBadge";
import ModelFailedQuestions from "@/components/ModelFailedQuestions";
import SubjectsChart from "@/components/SubjectsChart";
import SubjectsRadarChart, {
  type SubjectRadarSeries,
} from "@/components/SubjectsRadarChart";
import {
  getAllModelsBest,
  getFailedQuestions,
  getModelBest,
  getModelEfforts,
  getModelSummaries,
} from "@/lib/data";
import { sortSubjects } from "@/lib/subjects-order";
import type { FailedQuestion } from "@/lib/types";

export function generateStaticParams() {
  return getAllModelsBest().map((m) => ({ model: m.model }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ model: string }>;
}) {
  const { model } = await params;
  return { title: `${model} — Resultados de Pumabench` };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ model: string }>;
}) {
  const { model } = await params;
  const summaries = getModelSummaries(model);
  if (summaries.length === 0) notFound();

  const best = getModelBest(model)!;
  const efforts = getModelEfforts(model);
  const multi = summaries.length > 1;
  const base = summaries[0];

  const areaRows = base.areas.map((a) => {
    const values: Record<
      string,
      { percentage: number; correct: number; questions: number }
    > = {};
    for (const s of summaries) {
      const ad = s.areas.find((x) => x.area === a.area);
      if (ad) {
        values[s.effort] = {
          percentage: ad.total.percentage,
          correct: ad.total.correct,
          questions: ad.total.questions,
        };
      }
    }
    return {
      area: `Área ${a.area}`,
      areaName: a.area_name,
      values,
    };
  });

  const areaRadarSeries: AreaRadarSeries[] = summaries.map((s) => ({
    effort: s.effort,
    points: base.areas.map((a) => {
      const ad = s.areas.find((x) => x.area === a.area);
      return {
        area: `Área ${a.area}`,
        percentage: ad?.total.percentage ?? 0,
        correct: ad?.total.correct ?? 0,
        questions: ad?.total.questions ?? 0,
      };
    }),
  }));

  const subjectNames = sortSubjects(Object.keys(base.subjects));

  const subjectRows = subjectNames.map((subject) => {
    const values: Record<
      string,
      { percentage: number; correct: number; questions: number }
    > = {};
    for (const s of summaries) {
      const sub = s.subjects[subject];
      if (sub) {
        values[s.effort] = {
          percentage: sub.percentage,
          correct: sub.correct,
          questions: sub.questions,
        };
      }
    }
    return { subject, values };
  });

  const subjectRadarSeries: SubjectRadarSeries[] = summaries.map((s) => ({
    effort: s.effort,
    points: subjectNames.map((subject) => ({
      subject,
      percentage: s.subjects[subject]?.percentage ?? 0,
    })),
  }));

  const byEffort: Record<string, FailedQuestion[]> = {};
  let anyFailed = false;
  for (const s of summaries) {
    const fq = getFailedQuestions(model, s.effort);
    byEffort[s.effort] = fq;
    if (fq.length > 0) anyFailed = true;
  }

  return (
    <>
      <Link href="/" className="back-link">
        ← Todos los modelos
      </Link>

      <div className="page-head">
        <h1 className="model-name">
          {best.model}
          <span className="model-name-efforts">
            {efforts.map((e) => (
              <EffortBadge
                key={e}
                effort={e}
                className={e === best.effort ? "effort-best" : undefined}
              />
            ))}
          </span>
        </h1>
        <div className="chips">
          <span className="chip chip-primary">
            Mejor score: {best.overallPercentage.toFixed(1)}% ({best.effort})
          </span>
          {multi &&
            summaries
              .filter((s) => s.effort !== best.effort)
              .map((s) => (
                <span key={s.effort} className="chip">
                  {s.effort}: {s.overallPercentage.toFixed(1)}%
                </span>
              ))}
          <span className="chip">Promedio de {base.areas.length} áreas</span>
          <Link
            href={`/compare?models=${encodeURIComponent(best.model)}`}
            className="chip"
          >
            Comparar →
          </Link>
        </div>
      </div>

      <div className="card-duo">
        <section className="card">
          <AreasChart data={areaRows} efforts={efforts} title="Score por área" />
          <ul className="area-legend muted">
            {base.areas.map((a) => (
              <li key={a.area}>
                <strong>Área {a.area}:</strong> {a.area_name}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="card-title">Resumen por área</h2>
          <AreasRadarChart series={areaRadarSeries} />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Detalle por área</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                {efforts.map((e) => (
                  <th key={e} className="num">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {base.areas.map((a) => (
                <tr key={a.area}>
                  <td>
                    Área {a.area} — {a.area_name}
                  </td>
                  {efforts.map((e) => {
                    const s = summaries.find((x) => x.effort === e);
                    const ad = s?.areas.find((x) => x.area === a.area);
                    if (!ad)
                      return (
                        <td key={e} className="num">
                          —
                        </td>
                      );
                    const isBest = e === best.effort;
                    return (
                      <td
                        key={e}
                        className={`num${isBest ? " best" : ""}`}
                      >
                        {ad.total.percentage.toFixed(1)}% (
                        {ad.total.correct}/{ad.total.questions})
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="card-duo">
        <section className="card">
          <SubjectsChart
            data={subjectRows}
            efforts={efforts}
            title="Score por materia"
          />
        </section>

        <section className="card">
          <h2 className="card-title">Resumen por materia</h2>
          <SubjectsRadarChart
            series={subjectRadarSeries}
            subjects={subjectNames}
          />
        </section>
      </div>

      {multi && subjectNames.length > 0 && (
        <section className="card">
          <h2 className="card-title">Detalle por materia</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Materia</th>
                  {efforts.map((e) => (
                    <th key={e} className="num">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectNames.map((subject) => (
                  <tr key={subject}>
                    <td>{subject}</td>
                    {efforts.map((e) => {
                      const s = summaries.find((x) => x.effort === e);
                      const sub = s?.subjects[subject];
                      if (!sub)
                        return (
                          <td key={e} className="num">
                            —
                          </td>
                        );
                      const isBest = e === best.effort;
                      return (
                        <td
                          key={e}
                          className={`num${isBest ? " best" : ""}`}
                        >
                          {sub.percentage.toFixed(1)}% ({sub.correct}/
                          {sub.questions})
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {anyFailed && (
        <ModelFailedQuestions
          efforts={efforts}
          byEffort={byEffort}
          defaultEffort={best.effort}
        />
      )}
    </>
  );
}
