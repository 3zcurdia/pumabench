export interface ScoreStats {
  questions: number;
  correct: number;
  percentage: number;
}

export interface SubjectScore {
  percentage: number;
}

export interface AggregatedArea {
  area: number;
  area_name: string;
  total: ScoreStats;
  subjects: Record<string, ScoreStats>;
}

export interface ModelSummary {
  model: string;
  effort: string;
  runCount: number;
  overallPercentage: number;
  totalCorrect: number;
  totalQuestions: number;
  areas: AggregatedArea[];
  subjects: Record<string, SubjectScore>;
}
