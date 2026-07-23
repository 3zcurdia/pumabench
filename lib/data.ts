import fs from "node:fs";
import path from "node:path";
import type {
  AggregatedArea,
  AreaResult,
  ModelSummary,
  ScoreStats,
} from "./types";

const RESULTS_DIR = path.join(process.cwd(), "results");
const FILE_RE = /^(\d+)-area-(\d+)\.json$/;

const round1 = (n: number) => Math.round(n * 10) / 10;

function averageStats(list: ScoreStats[]): ScoreStats {
  const n = list.length;
  const avg = (get: (s: ScoreStats) => number) =>
    list.reduce((sum, s) => sum + get(s), 0) / n;
  return {
    questions: Math.round(avg((s) => s.questions)),
    correct: round1(avg((s) => s.correct)),
    percentage: round1(avg((s) => s.percentage)),
  };
}

/** Read every results/<model>/<timestamp>-area-<n>.json, grouped per model. */
function loadRuns(modelDir: string): AreaResult[] {
  const dir = path.join(RESULTS_DIR, modelDir);
  return fs
    .readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
    ) as AreaResult[];
}

function aggregateModel(model: string, results: AreaResult[]): ModelSummary {
  const timestamps = new Set(results.map((r) => r.timestamp));
  const areaNumbers = [...new Set(results.map((r) => r.area))].sort(
    (a, b) => a - b,
  );

  const areas: AggregatedArea[] = areaNumbers.map((areaNum) => {
    const runs = results.filter((r) => r.area === areaNum);
    const subjectNames = [
      ...new Set(runs.flatMap((r) => Object.keys(r.subjects))),
    ];

    const subjects: Record<string, ScoreStats> = {};
    for (const name of subjectNames) {
      const perRun = runs
        .map((r) => r.subjects[name])
        .filter((s): s is ScoreStats => Boolean(s));
      subjects[name] = averageStats(perRun);
    }

    return {
      area: areaNum,
      area_name: runs[0]?.area_name ?? `Área ${areaNum}`,
      total: averageStats(runs.map((r) => r.total)),
      subjects,
    };
  });

  const overall = round1(
    areas.reduce((sum, a) => sum + a.total.percentage, 0) / areas.length,
  );

  return {
    model,
    runCount: timestamps.size,
    overallPercentage: overall,
    totalCorrect: round1(areas.reduce((sum, a) => sum + a.total.correct, 0)),
    totalQuestions: areas.reduce((sum, a) => sum + a.total.questions, 0),
    areas,
  };
}

/** All models, sorted by overall percentage (best first). */
export function getAllModels(): ModelSummary[] {
  return fs
    .readdirSync(RESULTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => aggregateModel(d.name, loadRuns(d.name)))
    .sort((a, b) => b.overallPercentage - a.overallPercentage);
}

export function getModel(name: string): ModelSummary | null {
  const dir = path.join(RESULTS_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  return aggregateModel(name, loadRuns(name));
}

export function formatTimestamp(ts: string): string {
  // "20260722105445" -> "2026-07-22 10:54"
  if (ts.length !== 14) return ts;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`;
}
