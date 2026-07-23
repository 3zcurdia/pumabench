import Link from "next/link";
import AreaRankingsChart from "@/components/AreaRankingsChart";
import OverviewChart from "@/components/OverviewChart";
import SubjectRankingsChart from "@/components/SubjectRankingsChart";
import { getAllModels } from "@/lib/data";

export default function HomePage() {
  const models = getAllModels();

  const chartData = models.map((m) => ({
    model: m.model,
    percentage: m.overallPercentage,
    correct: m.totalCorrect,
    questions: m.totalQuestions,
  }));

  const areas = models[0]?.areas ?? [];
  const subjects = Object.keys(models[0]?.subjects ?? {});

  const areaChartData = areas.map((a) => ({
    area: a.area,
    areaName: a.area_name,
    rows: models.map((m) => {
      const area = m.areas.find((x) => x.area === a.area);
      return {
        model: m.model,
        percentage: area?.total.percentage ?? 0,
        correct: area?.total.correct ?? 0,
        questions: area?.total.questions ?? 0,
      };
    }),
  }));

  const subjectChartData = subjects.map((subject) => ({
    subject,
    rows: models.map((m) => ({
      model: m.model,
      percentage: m.subjects[subject]?.percentage ?? 0,
    })),
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="page-head">
        <h2 className="section-heading">Rankings by area</h2>
      </div>
      {areaChartData.map(({ area, areaName, rows }) => (
        <section className="card" key={area}>
          <AreaRankingsChart
            data={rows}
            areaName={areaName}
            title={`Área ${area}`}
          />
        </section>
      ))}

      <div className="page-head">
        <h2 className="section-heading">Rankings by subject</h2>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 20,
        }}
      >
        {subjectChartData.map(({ subject, rows }) => (
          <section className="card" key={subject} style={{ marginBottom: 0 }}>
            <SubjectRankingsChart data={rows} title={subject} />
          </section>
        ))}
      </div>
    </>
  );
}
