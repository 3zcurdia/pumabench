export interface ScoreStats {
  questions: number;
  correct: number;
  percentage: number;
}

/** Raw shape of results/<model>/<timestamp>-area-<n>.json */
export interface AreaResult {
  model: string;
  timestamp: string;
  area: number;
  area_name: string;
  total: ScoreStats;
  subjects: Record<string, ScoreStats>;
}

export interface AggregatedArea {
  area: number;
  area_name: string;
  total: ScoreStats;
  subjects: Record<string, ScoreStats>;
}

export interface ModelSummary {
  model: string;
  runCount: number;
  overallPercentage: number;
  totalCorrect: number;
  totalQuestions: number;
  areas: AggregatedArea[];
}
