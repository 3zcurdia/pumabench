import Link from "next/link";
import AreaRankingsChart from "@/components/AreaRankingsChart";
import EffortBadge from "@/components/EffortBadge";
import OverviewChart from "@/components/OverviewChart";
import ScoreVsParamsChart from "@/components/ScoreVsParamsChart";
import SubjectRankingsChart from "@/components/SubjectRankingsChart";
import TabPanel from "@/components/TabPanel";
import { getAllModels, getModelParams } from "@/lib/data";

export default function HomePage() {
  const models = getAllModels();
  const params = getModelParams();

  const scatterData = models
    .filter((m) => params[m.model] != null)
    .map((m) => ({
      model: m.model,
      effort: m.effort,
      parameters: params[m.model],
      percentage: m.overallPercentage,
    }));

  const chartData = models
    .map((m) => ({
      model: m.model,
      effort: m.effort,
      percentage: m.overallPercentage,
      correct: m.totalCorrect,
      questions: m.totalQuestions,
    }))
    .reverse();

  const areas = models[0]?.areas ?? [];
  const subjects = Object.keys(models[0]?.subjects ?? {});

  const areaChartData = areas.map((a) => ({
    area: a.area,
    areaName: a.area_name,
    rows: models.map((m) => {
      const area = m.areas.find((x) => x.area === a.area);
      return {
        model: m.model,
        effort: m.effort,
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
      effort: m.effort,
      percentage: m.subjects[subject]?.percentage ?? 0,
    })),
  }));

  return (
    <>
      <div className="hero">
        <h1 className="hero-title">PumaBench</h1>
        <p className="hero-subtitle">
          ¿Qué pasaría si un LLM hiciera el examen de admisión de la UNAM?
        </p>
        <p className="muted hero-desc">
          El examen de admisión cubre cuatro áreas de conocimiento, cada una con
          diferentes pesos por materia. Las calificaciones a continuación son el
          <strong>promedio entre áreas</strong> — no un total de puntos. Los
          modelos con múltiples ejecuciones muestran el promedio entre
          ejecuciones.
        </p>
        <p>
          <Link href="/compare" className="btn">
            Comparar modelos →
          </Link>{" "}
          <Link href="/failed" className="btn btn-outline">
            Preguntas más falladas →
          </Link>
        </p>
      </div>

      <div className="page-head">
        <h2 className="section-heading">Clasificación de modelos</h2>
      </div>

      <section className="card">
        <ScoreVsParamsChart data={scatterData} />
      </section>

      <section className="card">
        <OverviewChart data={chartData} title="Score promedio por modelo" />
      </section>

      <section className="card">
        <h2 className="card-title">Todos los modelos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Modelo</th>
                <th className="num">Score promedio</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={`${m.model}::${m.effort}`}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Link href={`/model/${encodeURIComponent(m.model)}`}>
                      {m.model}
                    </Link>
                    <EffortBadge effort={m.effort} />
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
        <h2 className="section-heading">Clasificación por área</h2>
      </div>
      <div className="tabbed-section">
        <TabPanel
          tabs={areaChartData.map((a) => `Área ${a.area}`)}
          children={areaChartData.map(({ area, areaName, rows }) => (
            <AreaRankingsChart
              key={area}
              data={rows}
              areaName={areaName}
              title={`Área ${area}`}
            />
          ))}
        />
      </div>

      <div className="page-head">
        <h2 className="section-heading">Clasificación por materia</h2>
      </div>
      <div className="tabbed-section">
        <TabPanel
          tabs={subjectChartData.map((s) => s.subject)}
          children={subjectChartData.map(({ subject, rows }) => (
            <SubjectRankingsChart key={subject} data={rows} title={subject} />
          ))}
        />
      </div>
    </>
  );
}
