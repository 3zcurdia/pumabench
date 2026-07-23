import Link from "next/link";
import OverviewChart from "@/components/OverviewChart";
import { getAllModels } from "@/lib/data";

export default function HomePage() {
  const models = getAllModels();

  const chartData = models.map((m) => ({
    model: m.model,
    percentage: m.overallPercentage,
    correct: m.totalCorrect,
    questions: m.totalQuestions,
    runs: m.runCount,
  }));

  return (
    <>
      <div className="hero">
        <h1 className="hero-title">PumaBench</h1>
        <p className="hero-subtitle">
          What would happen when an LLM takes the UNAM admission test?
        </p>
        <p className="muted hero-desc">
          The admission test covers four knowledge areas, each weighting the
          subjects differently. Scores below are the <strong>average across
          areas</strong> — not a raw point total. Models with multiple runs
          show the average across runs.
        </p>
        <p>
          <Link href="/compare" className="btn">
            Compare models →
          </Link>
        </p>
      </div>

      <div className="page-head">
        <h2 className="section-heading">Model rankings</h2>
      </div>

      <section className="card">
        <OverviewChart data={chartData} title="Average score per model" />
      </section>

      <section className="card">
        <h2 className="card-title">All models</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th className="num">Average score</th>
                <th className="num">Runs</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.model}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Link href={`/model/${encodeURIComponent(m.model)}`}>
                      {m.model}
                    </Link>
                  </td>
                  <td className="num">
                    <strong>{m.overallPercentage.toFixed(1)}%</strong> (
                    {m.totalCorrect}/{m.totalQuestions})
                  </td>
                  <td className="num">
                    {m.runCount}
                    {m.runCount > 1 && <span className="muted"> (avg)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
