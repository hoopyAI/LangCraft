import { Segment } from '../types';

export type ExerciseType = 'fill_blank' | 'multiple_choice' | 'listening';

export type ExerciseFocus = 'vocabulary' | 'listening' | 'grammar';

export interface ExercisePlanItem {
  type: ExerciseType;
  segmentIndex: number;
  focus: ExerciseFocus;
  rationale: string;
}

export interface ExerciseItem {
  id: string;
  type: ExerciseType;
  prompt: string;
  answer: string;
  choices?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExercisePlanResult {
  plan: ExercisePlanItem[];
}

export interface ExerciseGenerationContext extends ExercisePlanResult {
  articleTitle: string;
  segments: Segment[];
}

export interface ExerciseGenerationResult {
  plan: ExercisePlanItem[];
  exercises: ExerciseItem[];
  outputFile?: string;
}
