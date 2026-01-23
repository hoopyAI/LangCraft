import type { NextApiRequest, NextApiResponse } from 'next';
import { buildArticleWorkflow } from '@core/workflow';
import { initializeAzureOpenAI } from '@core/translator';
import { initializeGrammarAnalyzer, analyzeGrammarHighlights } from '@core/analysis';
import { initializeSpeechSynthesizer } from '@core/audio';
import path from 'path';
import { saveCachedLLMArticle } from '@core/cache';
import { assignColorsToVocabulary } from '@/utils/assignColors';

// Initialize services (ensure env vars are loaded)
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_SPEECH_VOICE = process.env.AZURE_SPEECH_VOICE || 'fr-FR-VivienneNeural';

if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY && AZURE_OPENAI_DEPLOYMENT_NAME) {
  initializeAzureOpenAI(AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME);
  initializeGrammarAnalyzer(AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME);
}

if (AZURE_SPEECH_KEY && AZURE_SPEECH_REGION) {
  initializeSpeechSynthesizer(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, AZURE_SPEECH_VOICE);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: 'Missing title or content' });
  }

  try {
    // We need to mock projectRoot because we might not want to write files to disk in the same way
    // or we need to ensure the path exists. For now, let's use a temp dir or the existing output dir.
    const projectRoot = path.resolve(process.cwd(), '..');
    process.env.CACHE_DIR = path.join(projectRoot, 'cache');

    const articleWorkflow = buildArticleWorkflow({
      projectRoot,
      shouldGenerateAudio: Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION),
      voiceName: AZURE_SPEECH_VOICE,
      assignColors: assignColorsToVocabulary
    });

    const article = await articleWorkflow.invoke({
      title,
      content
    });

    // Grammar analysis
    try {
      const grammarAnalysis = await analyzeGrammarHighlights(article.segments);
      if (grammarAnalysis.difficultyLevel) {
          article.difficultyLevel = grammarAnalysis.difficultyLevel;
      }
      if (grammarAnalysis.grammarHighlights?.length) {
          article.grammarHighlights = grammarAnalysis.grammarHighlights;
      }
    } catch (error) {
      console.error(`Failed to analyze grammar for "${title}":`, error);
    }

    try {
      saveCachedLLMArticle(title, {
        segments: article.segments.map(segment => ({
          french: segment.french,
          translation: segment.chinese,
          vocabulary: segment.vocabulary.map(v => ({
            french: v.french,
            chinese: v.chinese,
            lemma: v.lemma,
            partOfSpeech: v.partOfSpeech
          })),
          audioFilePath: segment.audioFilePath
        })),
        grammarHighlights: article.grammarHighlights,
        difficultyLevel: article.difficultyLevel
      });
    } catch (cacheError) {
      console.warn(`Failed to cache article "${title}":`, cacheError);
    }

    res.status(200).json(article);
  } catch (error: any) {
    console.error('Processing error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
}
