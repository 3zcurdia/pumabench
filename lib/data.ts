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
  subjectPercentages: Record<string, number>;
}

function parseCsv(): CsvRow[] {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.trim().split("\n");
  const header = lines[0].split(",");

  const subjectCols = header.slice(8);
  const areaCount = 4;

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      model: cols[0],
      effort: cols[1],
      score: parseFloat(cols[2]),
      avgPoints: parseFloat(cols[3]),
      areaPoints: cols.slice(4, 4 + areaCount).map(Number),
      subjectPercentages: Object.fromEntries(
        subjectCols.map((name, i) => [name, parseFloat(cols[8 + i])]),
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
    Object.entries(row.subjectPercentages).map(([name, percentage]) => [
      name,
      { percentage },
    ]),
  );

  const totalCorrect = row.avgPoints * areas.length;
  const totalQuestions = QUESTIONS_PER_AREA * areas.length;

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
