import Link from "next/link";
import { notFound } from "next/navigation";
import AreasChart from "@/components/AreasChart";
import SubjectsChart from "@/components/SubjectsChart";
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

  const subjectRows = Object.entries(summary.subjects)
    .map(([subject, s]) => ({
      subject,
      percentage: s.percentage,
      correct: 0,
      questions: 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);

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

      <section className="card">
        <h2 className="card-title">Area breakdown</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th className="num">Questions</th>
                <th className="num">Correct</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {summary.areas.map((a) => (
                <tr key={a.area}>
                  <td>
                    Área {a.area} — {a.area_name}
                  </td>
                  <td className="num">{a.total.questions}</td>
                  <td className="num">{a.total.correct}</td>
                  <td className="num">
                    <strong>{a.total.percentage.toFixed(1)}%</strong> (
                    {a.total.correct}/{a.total.questions})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <SubjectsChart data={subjectRows} title="Score per subject" />
      </section>
    </>
  );
}
