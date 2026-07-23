import Link from "next/link";
import CompareClient, {
  type CompareModel,
} from "@/components/CompareClient";
import { getAllModels } from "@/lib/data";

export const metadata = {
  title: "Compare models — PumaBench Results",
};

export default function ComparePage() {
  const models: CompareModel[] = getAllModels().map((m) => ({
    model: m.model,
    overallPercentage: m.overallPercentage,
    overallCorrect: m.totalCorrect,
    overallQuestions: m.totalQuestions,
    runCount: m.runCount,
    areas: m.areas.map((a) => ({
      area: a.area,
      area_name: a.area_name,
      percentage: a.total.percentage,
      correct: a.total.correct,
      questions: a.total.questions,
    })),
  }));

  return (
    <>
      <Link href="/" className="back-link">
        ← All models
      </Link>

      <div className="page-head">
        <h1>Compare models</h1>
        <p className="muted">
          Select two or more models to compare their average score per area.
          Each area is a knowledge area of the same test with different subject
          weights.
        </p>
      </div>

      <CompareClient models={models} />
    </>
  );
}
