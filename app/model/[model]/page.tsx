import Link from "next/link";
import { notFound } from "next/navigation";
import AreasChart from "@/components/AreasChart";
import AreasRadarChart from "@/components/AreasRadarChart";
import EffortBadge from "@/components/EffortBadge";
import SubjectsChart from "@/components/SubjectsChart";
import SubjectsRadarChart from "@/components/SubjectsRadarChart";
import { getAllModels, getFailedQuestions, getModel } from "@/lib/data";
import type { FailedQuestion, OptionValue } from "@/lib/types";

function renderOptionValue(val: OptionValue): string {
  if (typeof val === "string") return val;
  return val.image_description ?? `[Imagen: ${val.label}]`;
}

function FailedQuestionCard({ fq }: { fq: FailedQuestion }) {
  const optionKeys = Object.keys(fq.options);
  return (
    <div className="failed-question-card">
      <div className="failed-question-header">
        <span className="failed-question-number">#{fq.number}</span>
        <span className="failed-question-subject">{fq.subject}</span>
        <span className="failed-question-area">
          Área {fq.area}
        </span>
      </div>
      <p className="failed-question-text">{fq.question}</p>
      <div className="failed-question-options">
        {optionKeys.map((key) => {
          const isCorrect = key === fq.correctAnswer;
          const isModelAnswer = key === fq.modelAnswer;
          let cls = "failed-option";
          if (isCorrect) cls += " option-correct";
          if (isModelAnswer && !isCorrect) cls += " option-wrong";
          return (
            <div key={key} className={cls}>
              <span className="option-label">{key})</span>{" "}
              {renderOptionValue(fq.options[key])}
              {isCorrect && <span className="option-tag tag-correct">Correcta</span>}
              {isModelAnswer && !isCorrect && (
                <span className="option-tag tag-wrong">Respondida</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function generateStaticParams() {
  return getAllModels().map((m) => ({ model: m.model }));
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
  const summary = getModel(model);
  if (!summary) notFound();

  const areaRows = summary.areas.map((a) => ({
    label: `Área ${a.area}`,
    areaName: a.area_name,
    percentage: a.total.percentage,
    correct: a.total.correct,
    questions: a.total.questions,
  }));

  const radarRows = summary.areas.map((a) => ({
    area: `Área ${a.area}`,
    percentage: a.total.percentage,
    correct: a.total.correct,
    questions: a.total.questions,
  }));

  const subjectRows = Object.entries(summary.subjects)
    .map(([subject, s]) => ({
      subject,
      percentage: s.percentage,
      correct: s.correct,
      questions: s.questions,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const failedQuestions = getFailedQuestions(model, summary.effort);
  const failedByArea = new Map<number, FailedQuestion[]>();
  for (const fq of failedQuestions) {
    const list = failedByArea.get(fq.area) ?? [];
    list.push(fq);
    failedByArea.set(fq.area, list);
  }

  return (
    <>
      <Link href="/" className="back-link">
        ← Todos los modelos
      </Link>

      <div className="page-head">
        <h1 className="model-name">
          {summary.model}
          <EffortBadge effort={summary.effort} />
        </h1>
        <div className="chips">
          <span className="chip chip-primary">
            Score promedio: {summary.overallPercentage.toFixed(1)}%
          </span>
          <span className="chip">Promedio de {summary.areas.length} áreas</span>
          <Link
            href={`/compare?models=${encodeURIComponent(summary.model + "::" + summary.effort)}`}
            className="chip"
          >
            Comparar →
          </Link>
        </div>
      </div>

      <div className="card-duo">
        <section className="card">
          <AreasChart data={areaRows} title="Score por área" />
          <ul className="area-legend muted">
            {summary.areas.map((a) => (
              <li key={a.area}>
                <strong>Área {a.area}:</strong> {a.area_name}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="card-title">Resumen por área</h2>
          <AreasRadarChart data={radarRows} />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Detalle por área</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                <th className="num">Preguntas</th>
                <th className="num">Correctas</th>
                <th className="num">Calificación</th>
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

      <div className="card-duo">
        <section className="card">
          <SubjectsChart data={subjectRows} title="Score por materia" />
        </section>

        <section className="card">
          <h2 className="card-title">Resumen por materia</h2>
          <SubjectsRadarChart data={subjectRows} />
        </section>
      </div>

      {failedQuestions.length > 0 && (
        <section className="card failed-questions-section">
          <h2 className="card-title">
            Preguntas falladas
            <span className="failed-count-badge">{failedQuestions.length}</span>
          </h2>
          {Array.from(failedByArea.entries())
            .sort(([a], [b]) => a - b)
            .map(([area, questions]) => (
              <div key={area} className="failed-area-group">
                <h3 className="failed-area-title">
                  Área {area} — {questions[0].areaName}
                </h3>
                {questions.map((fq) => (
                  <FailedQuestionCard key={`${area}-${fq.number}`} fq={fq} />
                ))}
              </div>
            ))}
        </section>
      )}
    </>
  );
}
