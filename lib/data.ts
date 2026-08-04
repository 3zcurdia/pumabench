import fs from "node:fs";
import path from "node:path";
import type {
  AggregatedArea,
  FailedQuestion,
  ModelSummary,
  SubjectScore,
} from "./types";

const QUESTIONS_PER_AREA = 120;

const EFFORT_ORDER: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

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

/**
 * Parses a single CSV line, honouring double-quoted fields (which may contain
 * commas or escaped `""` quotes). A plain `split(",")` silently corrupts every
 * column after the first field that contains a comma.
 */
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  cols.push(field);
  return cols;
}

function parseCsv(): CsvRow[] {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.trim().split("\n");
  const header = parseCsvLine(lines[0]);

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

  return lines.slice(1).map((line, i) => {
    const cols = parseCsvLine(line);
    if (cols.length !== header.length) {
      throw new Error(
        `results.csv row ${i + 2} has ${cols.length} columns, expected ${header.length}`,
      );
    }
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

function pickBest(rows: ModelSummary[]): ModelSummary {
  return rows.reduce((best, row) => {
    if (row.overallPercentage > best.overallPercentage) return row;
    if (row.overallPercentage < best.overallPercentage) return best;
    const rowOrder = EFFORT_ORDER[row.effort] ?? 99;
    const bestOrder = EFFORT_ORDER[best.effort] ?? 99;
    return rowOrder < bestOrder ? row : best;
  });
}

export function getAllModelsBest(): ModelSummary[] {
  const groups = new Map<string, ModelSummary[]>();
  for (const m of getModels()) {
    const list = groups.get(m.model) ?? [];
    list.push(m);
    groups.set(m.model, list);
  }
  return Array.from(groups.values())
    .map(pickBest)
    .sort((a, b) => b.overallPercentage - a.overallPercentage);
}

export function getModelBest(name: string): ModelSummary | null {
  const rows = getModels().filter((m) => m.model === name);
  if (rows.length === 0) return null;
  return pickBest(rows);
}

export function getModelEfforts(name: string): string[] {
  const seen = new Set<string>();
  for (const m of getModels()) {
    if (m.model === name) seen.add(m.effort);
  }
  return Array.from(seen).sort(
    (a, b) => (EFFORT_ORDER[a] ?? 99) - (EFFORT_ORDER[b] ?? 99),
  );
}

export function getModelSummaries(name: string): ModelSummary[] {
  return getModels()
    .filter((m) => m.model === name)
    .sort(
      (a, b) => (EFFORT_ORDER[a.effort] ?? 99) - (EFFORT_ORDER[b.effort] ?? 99),
    );
}

const MODELS_JSON_PATH = path.join(process.cwd(), "data", "models.json");

interface ModelRegistryEntry {
  id: string;
  name: string;
  open?: boolean;
  parameters?: number | null;
  pricing?: { prompt?: string | null } | null;
}

let cachedRegistry: ModelRegistryEntry[] | null = null;

function getModelRegistry(): ModelRegistryEntry[] {
  if (!cachedRegistry) {
    cachedRegistry = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, "utf8"));
  }
  return cachedRegistry!;
}

export function getModelParams(): Record<string, number> {
  const raw = getModelRegistry();
  const result: Record<string, number> = {};
  for (const entry of raw) {
    if (entry.parameters == null) continue;
    const suffix = entry.id.includes("/") ? entry.id.split("/")[1] : entry.id;
    result[suffix] = entry.parameters;
    result[entry.name] = entry.parameters;
  }
  return result;
}

export function getModelOpen(): Record<string, boolean> {
  const raw = getModelRegistry();
  const result: Record<string, boolean> = {};
  for (const entry of raw) {
    const suffix = entry.id.includes("/") ? entry.id.split("/")[1] : entry.id;
    result[suffix] = entry.open ?? false;
    result[entry.name] = entry.open ?? false;
  }
  return result;
}

export function getModelPricing(): Record<string, number> {
  const raw = getModelRegistry();
  const result: Record<string, number> = {};
  for (const entry of raw) {
    if (entry.pricing == null || entry.pricing.prompt == null) continue;
    const promptPrice = parseFloat(entry.pricing.prompt);
    if (promptPrice <= 0) continue;
    const suffix = entry.id.includes("/") ? entry.id.split("/")[1] : entry.id;
    const pricePer1M = promptPrice * 1_000_000;
    result[suffix] = pricePer1M;
    result[entry.name] = pricePer1M;
  }
  return result;
}

const RESULTS_DIR = path.join(process.cwd(), "data", "results");
const ANSWERS_DIR = path.join(process.cwd(), "data", "answers");

interface RawFailedQuestion {
  number: number;
  subject: string;
  question: string;
  options: Record<string, unknown>;
  correct_answer: string;
  reference?: { type: string; content: string };
}

interface RawAreaResult {
  area: number;
  area_name: string;
  failed_questions: RawFailedQuestion[];
}

function findResultDir(modelName: string, effort: string): string | null {
  const candidates = [
    path.join(RESULTS_DIR, `${modelName}-thinking-${effort}`),
    path.join(RESULTS_DIR, `${modelName}-${effort}`),
    path.join(RESULTS_DIR, modelName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Fallback: any directory starting with model name
  if (fs.existsSync(RESULTS_DIR)) {
    for (const dir of fs.readdirSync(RESULTS_DIR)) {
      if (dir.startsWith(modelName + "-") || dir === modelName) {
        return path.join(RESULTS_DIR, dir);
      }
    }
  }
  return null;
}

function findAnswersDir(modelName: string, effort: string): string | null {
  const candidates = [
    path.join(ANSWERS_DIR, `${modelName}-thinking-${effort}`),
    path.join(ANSWERS_DIR, `${modelName}-${effort}`),
    path.join(ANSWERS_DIR, modelName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  if (fs.existsSync(ANSWERS_DIR)) {
    for (const dir of fs.readdirSync(ANSWERS_DIR)) {
      if (dir.startsWith(modelName + "-") || dir === modelName) {
        return path.join(ANSWERS_DIR, dir);
      }
    }
  }
  return null;
}

function readAnswerCsv(
  modelName: string,
  effort: string,
  timestamp: string,
  area: number,
): Map<number, string> {
  const answersDir = findAnswersDir(modelName, effort);
  if (!answersDir) return new Map();

  const csvPath = path.join(answersDir, `${timestamp}-area-${area}.csv`);
  if (!fs.existsSync(csvPath)) return new Map();

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.trim().split("\n").slice(1);
  const map = new Map<number, string>();
  for (const line of lines) {
    const [num, ans] = line.split(",");
    map.set(Number(num), ans.trim());
  }
  return map;
}

function getLatestTimestamp(modelDir: string): string | null {
  if (!fs.existsSync(modelDir)) return null;

  const files = fs.readdirSync(modelDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  const timestamps = new Set<string>();
  for (const f of files) {
    timestamps.add(f.split("-area-")[0]);
  }
  return Array.from(timestamps).sort().pop() ?? null;
}

export function getFailedQuestions(
  modelName: string,
  effort: string,
): FailedQuestion[] {
  const resultDir = findResultDir(modelName, effort);
  if (!resultDir) return [];

  const timestamp = getLatestTimestamp(resultDir);
  if (!timestamp) return [];

  const results: FailedQuestion[] = [];

  for (let area = 1; area <= 4; area++) {
    const jsonPath = path.join(resultDir, `${timestamp}-area-${area}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    const data: RawAreaResult = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!data.failed_questions?.length) continue;

    const answers = readAnswerCsv(modelName, effort, timestamp, area);

    for (const fq of data.failed_questions) {
      results.push({
        number: fq.number,
        subject: fq.subject,
        question: fq.question,
        options: fq.options as Record<string, string>,
        correctAnswer: fq.correct_answer,
        modelAnswer: answers.get(fq.number) ?? "?",
        area: data.area,
        areaName: data.area_name,
        reference: fq.reference,
      });
    }
  }

  return results;
}
