import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createNotionPage } from './notion';
import { ProcessedArticle, VocabularyItem } from './types';
import { initializeAzureOpenAI, VocabularyPair } from './translator';
import { NOTION_COLORS } from './utils/colors';
import { initializeSpeechSynthesizer } from './audio';
import { buildArticleWorkflow } from './workflow';
import { buildExerciseWorkflow } from './exercises/workflow';
import { initializeGrammarAnalyzer, analyzeGrammarHighlights } from './analysis';
import { loadCachedLLMArticle, saveCachedLLMArticle } from './cache';

dotenv.config();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_SPEECH_VOICE = process.env.AZURE_SPEECH_VOICE || 'fr-FR-VivienneNeural';

const shouldGenerateAudio = Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
const PROJECT_ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const isGenerateOnly = args.includes('--generate') && !args.includes('--publish');
const isPublishOnly = args.includes('--publish') && !args.includes('--generate');
const isBoth = !isGenerateOnly && !isPublishOnly;

const shouldRunGenerate = isGenerateOnly || isBoth;
const shouldRunPublish = isPublishOnly || isBoth;

if (shouldRunPublish && (!NOTION_TOKEN || !NOTION_PAGE_ID)) {
    console.error("Please set NOTION_TOKEN and NOTION_PAGE_ID in .env file");
    process.exit(1);
}

if (shouldRunGenerate && (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_DEPLOYMENT_NAME)) {
    console.error("Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME in .env file");
    process.exit(1);
}

// Initialize Azure OpenAI client
if (shouldRunGenerate) {
    initializeAzureOpenAI(AZURE_OPENAI_ENDPOINT!, AZURE_OPENAI_API_KEY!, AZURE_OPENAI_DEPLOYMENT_NAME!);
    initializeGrammarAnalyzer(AZURE_OPENAI_ENDPOINT!, AZURE_OPENAI_API_KEY!, AZURE_OPENAI_DEPLOYMENT_NAME!);
}

if (shouldGenerateAudio && shouldRunGenerate) {
    initializeSpeechSynthesizer(AZURE_SPEECH_KEY!, AZURE_SPEECH_REGION!, AZURE_SPEECH_VOICE);
    console.log(`Azure Speech initialized with voice ${AZURE_SPEECH_VOICE}`);
} else if (shouldRunGenerate) {
    console.warn('Azure Speech credentials missing. Audio pronunciation files will not be generated.');
}

const shuffleArray = <T>(items: T[]): T[] => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const assignColorsToVocabulary = (vocabulary: VocabularyPair[]): VocabularyItem[] => {
    if (!vocabulary || vocabulary.length === 0) {
        return [];
    }

    const availableIndices = Array.from({ length: NOTION_COLORS.length }, (_, idx) => idx);
    let colorPool = shuffleArray(availableIndices);

    return vocabulary.map(item => {
        if (colorPool.length === 0) {
            colorPool = shuffleArray(availableIndices);
        }
        const colorIndex = colorPool.pop()!;
        return {
            ...item,
            colorIndex
        };
    });
};

const articleWorkflow = buildArticleWorkflow({
    projectRoot: PROJECT_ROOT,
    shouldGenerateAudio,
    voiceName: AZURE_SPEECH_VOICE,
    assignColors: assignColorsToVocabulary
});

const exerciseWorkflow = buildExerciseWorkflow({
    projectRoot: PROJECT_ROOT
});

const main = async () => {
    const inputDir = path.join(__dirname, '..', 'input');
    
    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory not found: ${inputDir}`);
        process.exit(1);
    }

    // Read all .txt files from the input directory
    const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.txt'));
    
    if (files.length === 0) {
        console.error("No .txt files found in the input directory");
        process.exit(1);
    }

    console.log(`Found ${files.length} text file(s) to process`);

    for (const file of files) {
        const filePath = path.join(inputDir, file);
        console.log(`\nProcessing: ${file}`);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const filename = path.basename(filePath, path.extname(filePath));

        let article: ProcessedArticle | null = null;

        if (shouldRunGenerate) {
            try {
                article = await articleWorkflow.invoke({
                    title: filename,
                    content
                });

                const grammarAnalysis = await analyzeGrammarHighlights(article.segments);
                if (grammarAnalysis.difficultyLevel) {
                    article.difficultyLevel = grammarAnalysis.difficultyLevel;
                }
                if (grammarAnalysis.grammarHighlights?.length) {
                    article.grammarHighlights = grammarAnalysis.grammarHighlights;
                }

                /*
                try {
                    await exerciseWorkflow.invoke(article);
                } catch (error) {
                    console.error(`Failed to generate exercises for "${filename}":`, error);
                }
                */

                // Save full analysis to cache
                console.log(`Saving full analysis to cache for "${filename}"...`);
                saveCachedLLMArticle(filename, {
                    segments: article.segments.map(s => ({
                        french: s.french,
                        translation: s.chinese,
                        vocabulary: s.vocabulary.map(v => ({
                            french: v.french,
                            chinese: v.chinese,
                            lemma: v.lemma,
                            partOfSpeech: v.partOfSpeech
                        })),
                        audioFilePath: s.audioFilePath
                    })),
                    grammarHighlights: article.grammarHighlights,
                    difficultyLevel: article.difficultyLevel
                });
            } catch (error) {
                console.error(`\n❌ Critical error processing "${filename}":`);
                console.error(error);
                console.error("Aborting process to prevent invalid cache generation.");
                process.exit(1);
            }
        }

        if (shouldRunPublish) {
            if (!article) {
                // Load from cache
                console.log(`Loading analysis from cache for "${filename}"...`);
                const cached = loadCachedLLMArticle(filename);
                if (!cached) {
                    console.error(`No cache found for "${filename}". Skipping publish.`);
                    continue;
                }
                
                article = {
                    title: cached.title,
                    segments: cached.segments.map(s => ({
                        french: s.french,
                        chinese: s.translation,
                        vocabulary: assignColorsToVocabulary(s.vocabulary),
                        audioFilePath: s.audioFilePath
                    })),
                    grammarHighlights: cached.grammarHighlights,
                    difficultyLevel: cached.difficultyLevel
                };
            }

            console.log(`Creating Notion page for "${filename}"...`);
            try {
                const pageUrl = await createNotionPage(NOTION_TOKEN!, NOTION_PAGE_ID!, article);
                console.log(`Successfully created Notion page: ${pageUrl}`);
            } catch (error) {
                console.error(`Error creating Notion page:`, error);
            }
        }
    }

    console.log("\nAll files processed!");
};

main();
