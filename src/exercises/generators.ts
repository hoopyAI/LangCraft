import { randomUUID } from 'crypto';
import { Segment } from '../types';
import { buildFillInSentence } from '../utils/text';
import { ExerciseItem, ExercisePlanItem } from './types';

const pickRandom = <T>(items: T[], count: number): T[] => {
  const copy = [...items];
  const selection: T[] = [];
  while (copy.length > 0 && selection.length < count) {
    const index = Math.floor(Math.random() * copy.length);
    selection.push(copy.splice(index, 1)[0]);
  }
  return selection;
};

const buildFillBlankExercise = (segment: Segment, plan: ExercisePlanItem): ExerciseItem | null => {
  if (!segment.vocabulary || segment.vocabulary.length === 0) {
    return null;
  }

  const sentence = buildFillInSentence(segment.french, segment.vocabulary);
  const answer = segment.vocabulary.map(v => v.french).join(', ');

  return {
    id: randomUUID(),
    type: 'fill_blank',
    prompt: `${plan.rationale}\n${sentence}`,
    answer,
    metadata: {
      originalSentence: segment.french,
      vocabularyCount: segment.vocabulary.length
    }
  };
};

const buildMultipleChoiceExercise = (
  segment: Segment,
  plan: ExercisePlanItem,
  distractorSegments: Segment[]
): ExerciseItem | null => {
  const correct = segment.chinese?.trim();
  if (!correct) {
    return null;
  }

  const distractorTranslations = distractorSegments
    .map(s => s.chinese?.trim())
    .filter((value): value is string => Boolean(value) && value !== correct);

  if (distractorTranslations.length === 0) {
    return null;
  }

  const distractors = pickRandom(distractorTranslations, Math.min(3, distractorTranslations.length));
  const choices = [...distractors, correct].sort(() => Math.random() - 0.5);

  return {
    id: randomUUID(),
    type: 'multiple_choice',
    prompt: `${plan.rationale}\nQuelle est la traduction correcte pour: "${segment.french}" ?`,
    choices,
    answer: correct,
    metadata: {
      sentenceIndex: plan.segmentIndex,
      distractorCount: distractors.length
    }
  };
};

const buildListeningExercise = (segment: Segment, plan: ExercisePlanItem): ExerciseItem | null => {
  const audioPath = segment.audioFilePath;
  const translation = segment.chinese?.trim() || '';

  if (!audioPath) {
    return null;
  }

  return {
    id: randomUUID(),
    type: 'listening',
    prompt: `${plan.rationale}\n1. Écoute le fichier audio (${audioPath}).\n2. Résume le sens en français ou écris la traduction chinoise.`,
    answer: translation || '[Libre réponse]',
    metadata: {
      audioFile: audioPath,
      sentenceIndex: plan.segmentIndex
    }
  };
};

export const generateExerciseForPlanItem = (
  plan: ExercisePlanItem,
  segments: Segment[],
  distractorSegments: Segment[]
): ExerciseItem | null => {
  const segment = segments[plan.segmentIndex];
  if (!segment) {
    return null;
  }

  switch (plan.type) {
    case 'fill_blank':
      return buildFillBlankExercise(segment, plan);
    case 'multiple_choice':
      return buildMultipleChoiceExercise(segment, plan, distractorSegments);
    case 'listening':
      return buildListeningExercise(segment, plan);
    default:
      return null;
  }
};
