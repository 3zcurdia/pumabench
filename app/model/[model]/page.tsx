import Link from "next/link";
import { notFound } from "next/navigation";
import AreasChart from "@/components/AreasChart";
import SubjectsChart, { type SubjectRow } from "@/components/SubjectsChart";
import { getAllModels, getModel } from "@/lib/data";

export function generateStaticParams() {
  return getAllModels().map((m) => ({ model: m.model }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { model: string } }) {
  return { title: `${params.model} — Pumabench Results` };
}

export default function ModelPage({ params }: { params: { model: string } }) {
  const summary = getModel(params.model);
  if (!summary) notFound();

  const areaRows = summary.areas.map((a) => ({
    label: `Área ${a.area}`,
    areaName: a.area_name,
    percentage: a.total.percentage,
    correct: a.total.correct,
    questions: a.total.questions,
  }));

  return (
    <>
      <Link href="/" className="back-link">
        ← All models
      </Link>

      <div className="page-head">
        <h1 className="model-name">{summary.model}</h1>
        <div className="chips">
          <span className="chip chip-primary">
            Average score: {summary.overallPercentage.toFixed(1)}%
          </span>
          <span className="chip">Average of {summary.areas.length} areas</span>
          <span className="chip">
            {summary.runCount} run{summary.runCount === 1 ? "" : "s"}
            {summary.runCount > 1 ? " (averaged)" : ""}
          </span>
        </div>
      </div>

      <section className="card">
        <AreasChart data={areaRows} title="Score per area" />
        <ul className="area-legend muted">
          {summary.areas.map((a) => (
            <li key={a.area}>
              <strong>Área {a.area}:</strong> {a.area_name}
            </li>
          ))}
        </ul>
      </section>

      {summary.areas.map((area) => {
        const subjects: SubjectRow[] = Object.entries(area.subjects)
          .filter(([, s]) => s.questions > 0)
          .map(([subject, s]) => ({
            subject,
            percentage: s.percentage,
            correct: s.correct,
            questions: s.questions,
          }))
          .sort((a, b) => b.percentage - a.percentage);

        return (
          <section className="card" key={area.area}>
            <SubjectsChart
              data={subjects}
              title={
                <>
                  Área {area.area} — {area.area_name}
                </>
              }
              chip={
                <span className="chip chip-primary">
                  {area.total.percentage.toFixed(1)}% · {area.total.correct}/
                  {area.total.questions}
                </span>
              }
            />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th className="num">Questions</th>
                    <th className="num">Correct</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.subject}>
                      <td>{s.subject}</td>
                      <td className="num">{s.questions}</td>
                      <td className="num">{s.correct}</td>
                      <td className="num">
                        <strong>{s.percentage.toFixed(1)}%</strong> ({s.correct}
                        /{s.questions})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
