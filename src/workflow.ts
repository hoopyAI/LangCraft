import * as fs from 'fs';
import * as path from 'path';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { splitIntoSentences, translateAndExtractVocabulary, VocabularyPair } from './translator';
import { CachedLLMSegment, loadCachedLLMArticle, saveCachedLLMArticle } from './cache';
import { ProcessedArticle, VocabularyItem } from './types';
import { synthesizeAudioToFile } from './audio';

export interface ArticleWorkflowInput {
  title: string;
  content: string;
}

interface WorkflowConfig {
  projectRoot: string;
  shouldGenerateAudio: boolean;
  voiceName: string;
  assignColors: (vocabulary: VocabularyPair[]) => VocabularyItem[];
}

const sanitizeForPathSegment = (value: string): string => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalized.length > 0 ? normalized : 'article';
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const translateSentences = async (title: string, sentences: string[]): Promise<CachedLLMSegment[]> => {
  let llmSegments: CachedLLMSegment[] | null = null;
  const cached = loadCachedLLMArticle(title);
  const cacheMatchesCurrent = cached && cached.segments.length === sentences.length && cached.segments.every((segment, index) => segment.french === sentences[index]);

  if (cached && !cacheMatchesCurrent) {
    console.warn(`Cached data for "${title}" is outdated. Recomputing translations...`);
  }

  if (cacheMatchesCurrent && cached) {
    console.log(`Using cached LLM output for "${title}" (${cached.segments.length} sentences)`);
    llmSegments = cached.segments;
  }

  if (!llmSegments) {
    console.log(`Processing ${sentences.length} sentences in parallel...`);
    
    const results = await Promise.all(
      sentences.map(async (sentence, i) => {
        console.log(`Starting sentence ${i + 1}/${sentences.length}...`);
        const result = await translateAndExtractVocabulary(sentence);
        console.log(`  Sentence ${i + 1} done: ${result.vocabulary.length} words extracted`);
        return {
          french: sentence,
          translation: result.translation,
          vocabulary: result.vocabulary
        };
      })
    );

    llmSegments = results;
    saveCachedLLMArticle(title, { segments: llmSegments });
  }

  return llmSegments;
};

export const buildArticleWorkflow = (config: WorkflowConfig) => {
  const splitStep = RunnableLambda.from(async ({ title, content }: ArticleWorkflowInput) => {
    const sentences = splitIntoSentences(content);
    console.log(`Found ${sentences.length} sentences to translate...`);
    if (sentences.length === 0) {
      throw new Error('No sentences found in input content');
    }
    return { title, sentences };
  });

  const translationStep = RunnableLambda.from(async ({ title, sentences }: { title: string; sentences: string[] }) => {
    const llmSegments = await translateSentences(title, sentences);
    return { title, llmSegments };
  });

  const enrichmentStep = RunnableLambda.from(async ({ title, llmSegments }: { title: string; llmSegments: CachedLLMSegment[] }): Promise<ProcessedArticle> => {
    const audioFolder = config.shouldGenerateAudio
      ? path.join(config.projectRoot, 'output', 'audio', sanitizeForPathSegment(title))
      : null;

    if (audioFolder) {
      await fs.promises.mkdir(audioFolder, { recursive: true });
    }

    const voiceSuffix = config.voiceName.replace(/[^a-zA-Z0-9]/g, '_');

    const segments = await Promise.all(
      llmSegments.map(async (segment, index) => {
        let audioFilePath: string | undefined;

        if (audioFolder) {
          const sentenceLabel = `sentence-${String(index + 1).padStart(2, '0')}`;
          const audioFileName = `${sentenceLabel}_${voiceSuffix}.wav`;
          const absoluteAudioPath = path.join(audioFolder, audioFileName);

          try {
            if (await fileExists(absoluteAudioPath)) {
              audioFilePath = path.relative(config.projectRoot, absoluteAudioPath).split(path.sep).join('/');
              console.log(`  🔁 Audio cached: ${audioFilePath}`);
            } else {
              const { filePath: synthesizedPath } = await synthesizeAudioToFile(segment.french, absoluteAudioPath);
              audioFilePath = path.relative(config.projectRoot, synthesizedPath).split(path.sep).join('/');
              console.log(`  🔊 Audio saved: ${audioFilePath}`);
            }
          } catch (error) {
            console.error(`  Failed to synthesize audio for sentence ${index + 1}:`, error);
          }
        }

        return {
          french: segment.french,
          chinese: segment.translation,
          vocabulary: config.assignColors(segment.vocabulary),
          audioFilePath
        };
      })
    );

    if (audioFolder) {
      const articleAudioName = `article-full_${voiceSuffix}.wav`;
      const articleAudioAbsolute = path.join(audioFolder, articleAudioName);
      const articleAudioRelative = path.relative(config.projectRoot, articleAudioAbsolute).split(path.sep).join('/');
      const fullText = llmSegments.map(segment => segment.french).join(' ');

      try {
        if (await fileExists(articleAudioAbsolute)) {
          console.log(`  🔁 Full-length audio cached: ${articleAudioRelative}`);
        } else {
          await synthesizeAudioToFile(fullText, articleAudioAbsolute);
          console.log(`  🔊 Full-length audio saved: ${articleAudioRelative}`);
        }
      } catch (error) {
        console.error('  Failed to synthesize full-length audio:', error);
      }
    }

    return {
      title,
      segments
    };
  });

  const workflow = RunnableSequence.from([splitStep, translationStep, enrichmentStep]);
  return workflow;
};
