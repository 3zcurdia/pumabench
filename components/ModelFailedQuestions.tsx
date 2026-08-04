"use client";

import { useMemo, useState } from "react";
import { renderOptionValue } from "@/lib/options";
import type { FailedQuestion } from "@/lib/types";

function FailedQuestionCard({ fq }: { fq: FailedQuestion }) {
  const optionKeys = Object.keys(fq.options);
  return (
    <div className="failed-question-card">
      <div className="failed-question-header">
        <span className="failed-question-number">#{fq.number}</span>
        <span className="failed-question-subject">{fq.subject}</span>
        <span className="failed-question-area">Área {fq.area}</span>
      </div>
      <p className="failed-question-text">{fq.question}</p>
      {fq.reference?.content && (
        <details className="failed-question-context">
          <summary>Contexto</summary>
          <p className="failed-question-context-text">{fq.reference.content}</p>
        </details>
      )}
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

export interface FailedQuestionsByEffort {
  efforts: string[];
  byEffort: Record<string, FailedQuestion[]>;
  defaultEffort: string;
}

export default function ModelFailedQuestions({
  efforts,
  byEffort,
  defaultEffort,
}: FailedQuestionsByEffort) {
  const [active, setActive] = useState(defaultEffort);

  const failedQuestions = useMemo(
    () => byEffort[active] ?? [],
    [byEffort, active],
  );

  const failedByArea = useMemo(() => {
    const map = new Map<number, FailedQuestion[]>();
    for (const fq of failedQuestions) {
      const list = map.get(fq.area) ?? [];
      list.push(fq);
      map.set(fq.area, list);
    }
    return map;
  }, [failedQuestions]);

  return (
    <section className="card failed-questions-section">
      <h2 className="card-title">
        Preguntas falladas
        <span className="failed-count-badge">{failedQuestions.length}</span>
      </h2>
      <div className="failed-filter">
        <label className="failed-filter-label" htmlFor="failed-effort">
          Effort
        </label>
        <select
          id="failed-effort"
          className="failed-filter-select"
          value={active}
          onChange={(e) => setActive(e.target.value)}
        >
          {efforts.map((e) => {
            const count = byEffort[e]?.length ?? 0;
            return (
              <option key={e} value={e}>
                {e} ({count})
              </option>
            );
          })}
        </select>
      </div>
      {failedQuestions.length === 0 ? (
        <p className="muted">No hay preguntas falladas para este effort.</p>
      ) : (
        Array.from(failedByArea.entries())
          .sort(([a], [b]) => a - b)
          .map(([area, questions]) => (
            <div key={area} className="failed-area-group">
              <h3 className="failed-area-title">
                Área {area} — {questions[0].areaName}
              </h3>
              {questions.map((fq) => (
                <FailedQuestionCard
                  key={`${active}-${area}-${fq.number}`}
                  fq={fq}
                />
              ))}
            </div>
          ))
      )}
    </section>
  );
}
