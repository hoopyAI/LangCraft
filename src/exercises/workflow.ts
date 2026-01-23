import * as fs from 'fs';
import * as path from 'path';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { ProcessedArticle, Segment } from '../types';
import { ExerciseGenerationResult, ExerciseItem, ExercisePlanItem } from './types';
import { generateExerciseForPlanItem } from './generators';

interface ExerciseWorkflowConfig {
  projectRoot: string;
  maxFillBlanks?: number;
  maxMultipleChoice?: number;
}

const sanitizeTitle = (title: string): string => {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'article';
};

const buildExercisePlan = (segments: Segment[], config?: { maxFillBlanks?: number; maxMultipleChoice?: number }): ExercisePlanItem[] => {
  const maxFill = config?.maxFillBlanks ?? 4;
  const maxMCQ = config?.maxMultipleChoice ?? 3;

  const segmentsWithVocab = segments
    .map((segment, index) => ({ index, vocabCount: segment.vocabulary.length }))
    .filter(item => item.vocabCount > 0)
    .sort((a, b) => b.vocabCount - a.vocabCount);

  const plan: ExercisePlanItem[] = [];

  segmentsWithVocab.slice(0, maxFill).forEach(item => {
    plan.push({
      type: 'fill_blank',
      segmentIndex: item.index,
      focus: 'vocabulary',
      rationale: `Complète la phrase ${item.index + 1} en utilisant les mots clés appris.`
    });
  });

  segmentsWithVocab.slice(0, maxMCQ).forEach(item => {
    plan.push({
      type: 'multiple_choice',
      segmentIndex: item.index,
      focus: 'vocabulary',
      rationale: `Choisis la traduction la plus naturelle pour la phrase ${item.index + 1}.`
    });
  });

  const firstAudioIndex = segments.findIndex(segment => Boolean(segment.audioFilePath));
  if (firstAudioIndex >= 0) {
    plan.push({
      type: 'listening',
      segmentIndex: firstAudioIndex,
      focus: 'listening',
      rationale: `Travaille ta compréhension orale avec l'extrait ${firstAudioIndex + 1}.`
    });
  }

  return plan;
};

export const buildExerciseWorkflow = (config: ExerciseWorkflowConfig) => {
  const plannerStep = RunnableLambda.from(async (article: ProcessedArticle) => {
    const plan = buildExercisePlan(article.segments, {
      maxFillBlanks: config.maxFillBlanks,
      maxMultipleChoice: config.maxMultipleChoice
    });
    return { article, plan };
  });

  const generationStep = RunnableLambda.from(async ({ article, plan }: { article: ProcessedArticle; plan: ExercisePlanItem[] }) => {
    const exercises: ExerciseItem[] = [];
    const distractorSegments = article.segments;

    plan.forEach(planItem => {
      const exercise = generateExerciseForPlanItem(planItem, article.segments, distractorSegments);
      if (exercise) {
        exercises.push(exercise);
      }
    });

    return { article, plan, exercises };
  });

  const persistStep = RunnableLambda.from(async ({ article, plan, exercises }: { article: ProcessedArticle; plan: ExercisePlanItem[]; exercises: ExerciseItem[] }): Promise<ExerciseGenerationResult> => {
    const outputDir = path.join(config.projectRoot, 'output', 'exercises');
    await fs.promises.mkdir(outputDir, { recursive: true });

    const slug = sanitizeTitle(article.title);
    const filePath = path.join(outputDir, `${slug}.json`);

    const payload: ExerciseGenerationResult = {
      plan,
      exercises,
      outputFile: filePath
    };

    await fs.promises.writeFile(filePath, JSON.stringify({ title: article.title, ...payload }, null, 2), 'utf-8');
    console.log(`Adaptive exercises saved: ${path.relative(config.projectRoot, filePath)}`);

    return payload;
  });

  return RunnableSequence.from([plannerStep, generationStep, persistStep]);
};
