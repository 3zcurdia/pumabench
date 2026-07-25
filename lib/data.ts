import fs from "node:fs";
import path from "node:path";
import type { AggregatedArea, ModelSummary, SubjectScore } from "./types";

const QUESTIONS_PER_AREA = 120;

const AREA_NAMES: Record<number, string> = {
  1: "Ciencias Físico-Matemáticas y de las Ingenierías",
  2: "Ciencias Biológicas, Químicas y de la Salud",
  3: "Ciencias Sociales",
  4: "Humanidades y de las Artes",
};

const CSV_PATH = path.join(process.cwd(), "data", "results.csv");

interface CsvRow {
  model: string;
  effort: string;
  score: number;
  avgPoints: number;
  areaPoints: number[];
  subjectScores: Record<string, { correct: number; questions: number }>;
}

function parseCsv(): CsvRow[] {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.trim().split("\n");
  const header = lines[0].split(",");

  const colIndex = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) {
      throw new Error(`results.csv is missing required column "${name}"`);
    }
    return idx;
  };

  const modelIdx = colIndex("model");
  const effortIdx = colIndex("effort");
  const scoreIdx = colIndex("score");
  const avgPointsIdx = colIndex("avg points");
  const areaCount = 4;
  const areaStart = avgPointsIdx + 1;
  const subjectCols = header.slice(areaStart + areaCount);

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      model: cols[modelIdx],
      effort: cols[effortIdx],
      score: parseFloat(cols[scoreIdx]),
      avgPoints: parseFloat(cols[avgPointsIdx]),
      areaPoints: cols.slice(areaStart, areaStart + areaCount).map(Number),
      subjectScores: Object.fromEntries(
        subjectCols.map((name, i) => {
          const raw = cols[areaStart + areaCount + i];
          const [correct, questions] = raw.split("/").map(Number);
          return [name, { correct, questions }];
        }),
      ),
    };
  });
}

function csvRowToModelSummary(row: CsvRow): ModelSummary {
  const areas: AggregatedArea[] = row.areaPoints.map((points, i) => {
    const areaNum = i + 1;
    return {
      area: areaNum,
      area_name: AREA_NAMES[areaNum] ?? `Área ${areaNum}`,
      total: {
        questions: QUESTIONS_PER_AREA,
        correct: points,
        percentage: Math.round((points / QUESTIONS_PER_AREA) * 1000) / 10,
      },
      subjects: {},
    };
  });

  const subjects: Record<string, SubjectScore> = Object.fromEntries(
    Object.entries(row.subjectScores).map(([name, { correct, questions }]) => [
      name,
      {
        correct,
        questions,
        percentage: questions === 0 ? 0 : Math.round((correct / questions) * 1000) / 10,
      },
    ]),
  );

  const totalCorrect = row.avgPoints;
  const totalQuestions = QUESTIONS_PER_AREA;

  return {
    model: row.model,
    effort: row.effort,
    runCount: 1,
    overallPercentage: row.score,
    totalCorrect: Math.round(totalCorrect * 10) / 10,
    totalQuestions,
    areas,
    subjects,
  };
}

let cachedModels: ModelSummary[] | null = null;

function getModels(): ModelSummary[] {
  if (!cachedModels) {
    cachedModels = parseCsv()
      .map(csvRowToModelSummary)
      .sort((a, b) => b.overallPercentage - a.overallPercentage);
  }
  return cachedModels;
}

export function getAllModels(): ModelSummary[] {
  return getModels();
}

export function getModel(name: string): ModelSummary | null {
  return getModels().find((m) => m.model === name) ?? null;
}

const MODELS_JSON_PATH = path.join(process.cwd(), "data", "models.json");

export function getModelParams(): Record<string, number> {
  const raw = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, "utf8"));
  const result: Record<string, number> = {};
  for (const entry of raw) {
    if (entry.parameters == null) continue;
    const suffix = entry.id.includes("/") ? entry.id.split("/")[1] : entry.id;
    result[suffix] = entry.parameters;
    result[entry.name] = entry.parameters;
  }
  return result;
}
