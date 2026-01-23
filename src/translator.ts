import { AzureChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

const AZURE_API_VERSION = '2024-08-01-preview';

const vocabularySchema = z.object({
    french: z.string().min(1),
    lemma: z.string().optional(),
    chinese: z.string().min(1),
    partOfSpeech: z.string().optional()
});

const translationSchema = z.object({
    translation: z.string().min(1),
    vocabulary: z.array(vocabularySchema).max(5)
});

type WorkflowOutput = z.infer<typeof translationSchema>;

let model: AzureChatOpenAI | null = null;
let prompt: ChatPromptTemplate | null = null;

const extractInstanceName = (endpoint: string): string => {
    if (!endpoint) {
        return '';
    }
    const trimmed = endpoint
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');
    return trimmed.split('.')[0];
};

const buildSentenceWorkflow = (endpoint: string, apiKey: string, deploymentName: string) => {
    prompt = ChatPromptTemplate.fromMessages([
        [
            'user',
            `You are a professional translator and language learning assistant.

Your task:
1. Translate the French sentence to Chinese naturally and accurately.
2. Select A1-B2 level vocabulary words from the French sentence (important nouns, verbs, adjectives, or expressions). Skip the simple/common words.
3. For EACH selected French word, identify its exact corresponding translation in the Chinese sentence.
4. Ensure strict one-to-one correspondence: if you select 4 French words, you must provide exactly 4 Chinese translations.
5. For partOfSpeech, use ONLY standard French abbreviations: n.m. (masculine noun), n.f. (feminine noun), adj. (adjective), v. (verb), adv. (adverb), prep. (preposition), conj. (conjunction), pron. (pronoun). Do NOT use English or Chinese words.

You must respond ONLY with a valid JSON object (no markdown, no code blocks) with the following structure:
{{
  "translation": "the Chinese translation",
  "vocabulary": [
    {{
      "french": "word in French",
      "lemma": "lemma form (optional)",
      "chinese": "Chinese translation",
      "partOfSpeech": "French abbreviation (optional)"
    }}
  ]
}}

French sentence: {sentence}`
        ]
    ]);

    model = new AzureChatOpenAI({
        azureOpenAIApiKey: apiKey,
        azureOpenAIApiInstanceName: extractInstanceName(endpoint),
        azureOpenAIApiDeploymentName: deploymentName,
        azureOpenAIApiVersion: AZURE_API_VERSION,
        temperature: 1,
        maxTokens: undefined,
        modelKwargs: {
            max_completion_tokens: 1500,
            response_format: { type: "json_object" }
        }
    });
};

export const initializeAzureOpenAI = (endpoint: string, apiKey: string, deploymentName: string) => {
    buildSentenceWorkflow(endpoint, apiKey, deploymentName);
};

export interface TranslationResult {
    translation: string;
    vocabulary: VocabularyPair[];
}

export interface VocabularyPair {
    french: string;
    lemma?: string;
    chinese: string;
    partOfSpeech?: string;
}

export const translateAndExtractVocabulary = async (frenchText: string): Promise<TranslationResult> => {
    if (!model || !prompt) {
        throw new Error("Azure OpenAI workflow not initialized");
    }

    try {
        const chain = prompt.pipe(model);
        const response = await chain.invoke({ sentence: frenchText });
        
        console.log(`  Raw response type: ${typeof response}`);
        console.log(`  Raw response content:`, response.content);

        let raw: WorkflowOutput;
        if (typeof response.content === 'string') {
            raw = JSON.parse(response.content);
        } else {
            throw new Error("Unexpected response format");
        }

        if (!raw || !raw.translation) {
            throw new Error("No valid response from model");
        }

        const translation = raw.translation || "";
        const rawVocabulary = raw.vocabulary || [];

        const validatedVocabulary = rawVocabulary
            .filter((item: any) => {
                const frenchExists = frenchText.toLowerCase().includes(item.french.toLowerCase());
                const chineseExists = translation.includes(item.chinese);

                if (!frenchExists) {
                    console.warn(`  Warning: French word "${item.french}" not found in sentence`);
                }
                if (!chineseExists) {
                    console.warn(`  Warning: Chinese word "${item.chinese}" not found in translation`);
                }

                return frenchExists && chineseExists;
            })
            .filter((item: any, index: number, self: any[]) => {
                const firstFrenchIndex = self.findIndex((v: any) => v.french === item.french);
                const firstChineseIndex = self.findIndex((v: any) => v.chinese === item.chinese);
                return firstFrenchIndex === index && firstChineseIndex === index;
            })
            .map((item: any) => ({
                french: item.french,
                lemma: (item.lemma || '').trim() || undefined,
                chinese: item.chinese,
                partOfSpeech: (item.partOfSpeech || '').trim() || undefined
            }));

        if (validatedVocabulary.length !== rawVocabulary.length) {
            console.warn(`  Filtered ${rawVocabulary.length - validatedVocabulary.length} invalid vocabulary items`);
        }

        return {
            translation,
            vocabulary: validatedVocabulary
        };
    } catch (error) {
        console.error("Translation and vocabulary extraction error:", error);
        throw error;
    }
};

export const splitIntoSentences = (text: string): string[] => {
    // Split by common sentence endings, handling French punctuation
    // This regex splits on . ! ? followed by space/newline, but preserves abbreviations
    const sentences = text
        .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÿ])/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    return sentences;
};
