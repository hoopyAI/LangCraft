import { AzureChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { z } from 'zod';
import { DifficultyLevel, GrammarHighlight, Segment } from './types';

const AZURE_API_VERSION = '2024-08-01-preview';

const grammarSchema = z.object({
  difficulty: z.enum(['A1', 'A2', 'B1', 'B2']).describe('Overall CEFR difficulty of the article'),
  grammar_points: z
    .array(
      z.object({
        title: z.string().min(1),
        pattern: z.string().min(1),
        explanation: z.string().min(1),
        example_french: z.string().min(1),
        example_chinese: z.string().min(1)
      })
    )
    .min(3)
    .max(5)
});

type GrammarWorkflowOutput = z.infer<typeof grammarSchema>;

let grammarWorkflow: Runnable<{ content: string }, GrammarWorkflowOutput> | null = null;

const extractInstanceName = (endpoint: string): string => {
  if (!endpoint) {
    return '';
  }
  const trimmed = endpoint.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return trimmed.split('.')[0];
};

const escapeBraces = (value: string) => value.replace(/[{}]/g, match => `${match}${match}`);

const buildGrammarWorkflow = (endpoint: string, apiKey: string, deploymentName: string): Runnable<{ content: string }, GrammarWorkflowOutput> => {
  const parser = StructuredOutputParser.fromZodSchema(grammarSchema);
  const formatInstructions = escapeBraces(parser.getFormatInstructions());

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
  `You are a French language pedagogy expert.
Given a short article with French sentences (and their Chinese translations), analyze the overall difficulty level and extract the most instructive grammar patterns.
Guidelines:
- Focus on key sentence patterns, idiomatic expressions, and structures that are highly useful for speaking and writing skills.
- SKIP basic grammar concepts such as word gender (masculine/feminine), simple conjugations, or basic agreement rules.
- The \"title\" and \"explanation\" fields for each grammar point must be written in Simplified Chinese, concise and learner-friendly.
- Keep \"pattern\" and \"example_french\" in French, and \"example_chinese\" in Chinese.
Return a strict JSON object using these instructions:
${formatInstructions}`
    ],
    [
      'user',
      'Article content:\n{content}'
    ]
  ]);

  const model = new AzureChatOpenAI({
    azureOpenAIApiKey: apiKey,
    azureOpenAIApiInstanceName: extractInstanceName(endpoint),
    azureOpenAIApiDeploymentName: deploymentName,
    azureOpenAIApiVersion: AZURE_API_VERSION,
    temperature: 0.2,
    maxTokens: 1200
  });

  return prompt.pipe(model).pipe(parser);
};

export const initializeGrammarAnalyzer = (endpoint: string, apiKey: string, deploymentName: string) => {
  grammarWorkflow = buildGrammarWorkflow(endpoint, apiKey, deploymentName);
};

export interface GrammarAnalysisResult {
  difficultyLevel?: DifficultyLevel;
  grammarHighlights?: GrammarHighlight[];
}

export const analyzeGrammarHighlights = async (segments: Segment[]): Promise<GrammarAnalysisResult> => {
  if (!grammarWorkflow) {
    throw new Error('Grammar analyzer not initialized');
  }

  const content = segments
    .map((segment, index) => `Sentence ${index + 1}: ${segment.french}\nChinese: ${segment.chinese}`)
    .join('\n\n');

  try {
    const result = await grammarWorkflow.invoke({ content });
    const highlights: GrammarHighlight[] = result.grammar_points.map(point => ({
      title: point.title.trim(),
      pattern: point.pattern.trim(),
      explanation: point.explanation.trim(),
      exampleFrench: point.example_french.trim(),
      exampleChinese: point.example_chinese.trim()
    }));

    return {
      difficultyLevel: result.difficulty,
      grammarHighlights: highlights
    };
  } catch (error) {
    console.error('Grammar analysis failed:', error);
    return {};
  }
};
