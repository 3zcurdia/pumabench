import Link from "next/link";
import CompareClient, {
  type CompareModel,
} from "@/components/CompareClient";
import { getAllModels } from "@/lib/data";

export const metadata = {
  title: "Comparar modelos — Resultados de Pumabench",
};

export default function ComparePage() {
  const models: CompareModel[] = getAllModels().map((m) => ({
    modelKey: `${m.model}::${m.effort}`,
    model: m.model,
    effort: m.effort,
    overallPercentage: m.overallPercentage,
    overallCorrect: m.totalCorrect,
    overallQuestions: m.totalQuestions,
    areas: m.areas.map((a) => ({
      area: a.area,
      area_name: a.area_name,
      percentage: a.total.percentage,
      correct: a.total.correct,
      questions: a.total.questions,
    })),
    subjects: Object.fromEntries(
      Object.entries(m.subjects).map(([name, s]) => [name, { percentage: s.percentage, correct: s.correct, questions: s.questions }]),
    ),
  }));

  return (
    <>
      <Link href="/" className="back-link">
        ← Todos los modelos
      </Link>

      <div className="page-head">
        <h1>Comparar modelos</h1>
        <p className="muted">
          Selecciona dos o más modelos para comparar su calificación promedio por
          área y por materia. Cada área es una zona de conocimiento del mismo
          examen con diferentes pesos por materia.
        </p>
      </div>

      <CompareClient models={models} />
    </>
  );
}
