"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { renderOptionValue } from "@/lib/options";
import type { GlobalFailedQuestion } from "@/lib/types";

interface FailedQuestion extends GlobalFailedQuestion {}

function buildDirToSlugMap(
  models: { model: string }[],
): Map<string, string> {
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

function FailureBar({ count, total }: { count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="failure-bar-wrap">
      <div className="failure-bar" style={{ width: `${pct}%` }} />
      <span className="failure-bar-label">
        {count}/{total}
      </span>
    </div>
  );
}

function FailedQuestionCard({
  fq,
  rank,
  dirToSlug,
  totalModels,
}: {
  fq: FailedQuestion;
  rank: number;
  dirToSlug: Map<string, string>;
  totalModels: number;
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
      <FailureBar count={fq.models.length} total={totalModels} />
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

const ALL = "__all__";

export default function FailedQuestionsList({
  questions,
  models,
}: {
  questions: FailedQuestion[];
  models: { model: string }[];
}) {
  const [subject, setSubject] = useState<string>(ALL);
  const dirToSlug = useMemo(() => buildDirToSlugMap(models), [models]);
  const totalModels = dirToSlug.size;

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) set.add(q.subject);
    return Array.from(set).sort();
  }, [questions]);

  const filtered = useMemo(() => {
    if (subject === ALL) return questions;
    return questions.filter((q) => q.subject === subject);
  }, [questions, subject]);

  return (
    <>
      <div className="failed-filter">
        <label className="failed-filter-label" htmlFor="failed-subject">
          Filtrar por materia
        </label>
        <select
          id="failed-subject"
          className="failed-filter-select"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value={ALL}>Todas ({questions.length})</option>
          {subjects.map((s) => {
            const count = questions.filter((q) => q.subject === s).length;
            return (
              <option key={s} value={s}>
                {s} ({count})
              </option>
            );
          })}
        </select>
        <span className="failed-filter-count muted">
          {filtered.length} pregunta{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="failed-global-list">
        {filtered.map((fq, i) => (
          <FailedQuestionCard
            key={`${fq.area}-${fq.number}`}
            fq={fq}
            rank={i + 1}
            dirToSlug={dirToSlug}
            totalModels={totalModels}
          />
        ))}
      </div>
    </>
  );
}
