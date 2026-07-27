import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { getAllModels } from "@/lib/data";
import type { OptionValue } from "@/lib/types";

interface FailedQuestion {
  number: number;
  subject: string;
  question: string;
  options: Record<string, OptionValue>;
  correct_answer: string;
  reference?: { type: string; content: string };
  area: number;
  area_name: string;
  models: string[];
}

const TOTAL_MODELS = 32;

function renderOptionValue(val: OptionValue): string {
  if (typeof val === "string") return val;
  return val.image_description ?? `[Imagen: ${val.label}]`;
}

function buildDirToSlugMap(): Map<string, string> {
  const models = getAllModels();
  const map = new Map<string, string>();
  for (const m of models) {
    map.set(m.model, m.model);
  }
  return map;
}

function resolveModelSlug(
  dirName: string,
  dirToSlug: Map<string, string>,
): string | null {
  if (dirToSlug.has(dirName)) return dirToSlug.get(dirName)!;
  for (const [slug] of dirToSlug) {
    if (dirName.startsWith(slug + "-") || dirName === slug) return slug;
  }
  return null;
}

function FailureBar({ count }: { count: number }) {
  const pct = Math.round((count / TOTAL_MODELS) * 100);
  return (
    <div className="failure-bar-wrap">
      <div className="failure-bar" style={{ width: `${pct}%` }} />
      <span className="failure-bar-label">
        {count}/{TOTAL_MODELS}
      </span>
    </div>
  );
}

function FailedQuestionCard({
  fq,
  rank,
  dirToSlug,
}: {
  fq: FailedQuestion;
  rank: number;
  dirToSlug: Map<string, string>;
}) {
  const optionKeys = Object.keys(fq.options);
  return (
    <div className="failed-global-card">
      <div className="failed-global-header">
        <span className="failed-global-rank">#{rank}</span>
        <span className="failed-question-number">Q{fq.number}</span>
        <span className="failed-question-subject">{fq.subject}</span>
        <span className="failed-question-area">Área {fq.area}</span>
        <span className="failed-global-count">
          {fq.models.length} modelo{fq.models.length !== 1 ? "s" : ""} fallaron
        </span>
      </div>
      <FailureBar count={fq.models.length} />
      <p className="failed-question-text">{fq.question}</p>
      {fq.reference?.content && (
        <details className="failed-question-context">
          <summary>Contexto</summary>
          <p className="failed-question-context-text">{fq.reference.content}</p>
        </details>
      )}
      <div className="failed-question-options">
        {optionKeys.map((key) => {
          const isCorrect = key === fq.correct_answer;
          return (
            <div
              key={key}
              className={`failed-option${isCorrect ? " option-correct" : ""}`}
            >
              <span className="option-label">{key})</span>{" "}
              {renderOptionValue(fq.options[key])}
              {isCorrect && (
                <span className="option-tag tag-correct">Correcta</span>
              )}
            </div>
          );
        })}
      </div>
      {fq.models.length > 0 && (
        <details className="failed-models-details">
          <summary>Modelos que fallaron ({fq.models.length})</summary>
          <div className="failed-models-list">
            {fq.models.map((m) => {
              const slug = resolveModelSlug(m, dirToSlug);
              if (!slug) return null;
              return (
                <Link
                  key={m}
                  href={`/model/${encodeURIComponent(slug)}`}
                  className="failed-model-link"
                >
                  {m}
                </Link>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function getFailedQuestions(): FailedQuestion[] {
  const filePath = path.join(process.cwd(), "data", "failed_questions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const data: FailedQuestion[] = JSON.parse(raw);
  return data.sort((a, b) => b.models.length - a.models.length);
}

export const metadata = {
  title: "Preguntas más falladas — Pumabench Results",
};

export default function FailedQuestionsPage() {
  const questions = getFailedQuestions();
  const dirToSlug = buildDirToSlugMap();

  return (
    <>
      <Link href="/" className="back-link">
        ← Todos los modelos
      </Link>

      <div className="page-head">
        <h1 className="section-heading">Preguntas más falladas</h1>
        <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>
          {questions.length} preguntas que al menos un modelo falló, ordenadas
          por número de modelos que las fallaron.
        </p>
      </div>

      <div className="failed-global-list">
        {questions.map((fq, i) => (
          <FailedQuestionCard
            key={`${fq.area}-${fq.number}`}
            fq={fq}
            rank={i + 1}
            dirToSlug={dirToSlug}
          />
        ))}
      </div>
    </>
  );
}
