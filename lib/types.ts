export interface ScoreStats {
  questions: number;
  correct: number;
  percentage: number;
}

export interface SubjectScore {
  correct: number;
  questions: number;
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

export type OptionValue = string | { label: string; image_description?: string };

export interface FailedQuestion {
  number: number;
  subject: string;
  question: string;
  options: Record<string, OptionValue>;
  correctAnswer: string;
  modelAnswer: string;
  area: number;
  areaName: string;
  reference?: { type: string; content: string };
}
