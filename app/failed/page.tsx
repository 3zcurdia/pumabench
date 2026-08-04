import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import FailedQuestionsList from "@/components/FailedQuestionsList";
import { getAllModelsBest } from "@/lib/data";
import type { GlobalFailedQuestion } from "@/lib/types";

function getFailedQuestions(): GlobalFailedQuestion[] {
  const filePath = path.join(process.cwd(), "data", "failed_questions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const data: GlobalFailedQuestion[] = JSON.parse(raw);
  return data.sort((a, b) => b.models.length - a.models.length);
}

export const metadata = {
  title: "Preguntas más falladas — Pumabench Results",
};

export default function FailedQuestionsPage() {
  const questions = getFailedQuestions();
  const models = getAllModelsBest().map((m) => ({ model: m.model }));

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

      <FailedQuestionsList questions={questions} models={models} />
    </>
  );
}
