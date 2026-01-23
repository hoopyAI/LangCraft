# LangCraft

A LangChain-powered French learning tool that transforms French text into rich, bilingual study materials with vocabulary highlights, grammar analysis, audio pronunciation, and exports to Notion or PDF.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        index.ts                              │
│                   (Entry point / CLI)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    workflow.ts                               │
│         LangChain RunnableSequence (3 steps)                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐       │
│  │ splitStep│ → │translationStep│ → │ enrichmentStep │       │
│  └──────────┘   └──────────────┘   └────────────────┘       │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│translator.ts│ │ analysis.ts│ │  audio.ts  │
│  (LangChain │ │ (LangChain │ │(Azure TTS) │
│   Chain)    │ │   Chain)   │ │            │
└─────────────┘ └────────────┘ └────────────┘
```

## LangChain Components

| Component | File | Purpose |
|-----------|------|---------|
| `RunnableSequence` | `workflow.ts` | Chains split → translate → enrich steps |
| `RunnableLambda` | `workflow.ts` | Wraps async functions as composable runnables |
| `AzureChatOpenAI` | `translator.ts`, `analysis.ts` | Azure OpenAI model wrapper |
| `ChatPromptTemplate` | `translator.ts`, `analysis.ts` | Structured prompts for LLM |
| `StructuredOutputParser` | `analysis.ts` | Zod-validated JSON parsing |

## Data Flow

1. **Input**: French `.txt` file
2. **Split**: Text → array of sentences
3. **Translate** (LangChain): Each sentence → `{ translation, vocabulary[] }` (parallel processing)
4. **Enrich**: Add audio paths, assign colors to vocabulary
5. **Analyze** (LangChain): Full article → difficulty level (A1-B2) + grammar highlights
6. **Output**: Notion page / PDF with bilingual content

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure environment variables:
    Create a `.env` file in the root directory (if it doesn't exist) and add your credentials:
    ```env
    NOTION_TOKEN=your_notion_integration_token
    NOTION_PAGE_ID=your_parent_page_id
    
    # Azure OpenAI Configuration
    AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
    AZURE_OPENAI_API_KEY=your_azure_openai_api_key
    AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name

    # Azure Speech (Text-to-Speech)
    AZURE_SPEECH_KEY=your_speech_key
    AZURE_SPEECH_REGION=your_speech_region
    AZURE_SPEECH_VOICE=fr-FR-VivienneNeural
    ```

## Usage

1. Place your French text files (`.txt` format) in the `input` folder.

2. Run the tool:

```bash
npm start
```

The tool will automatically process all `.txt` files in the `input` directory and create Notion pages.

## Features

-   Reads French text files from the `input` folder.
-   Splits content into sentences.
-   Translates each sentence to Chinese using Azure OpenAI.
-   Extracts 3-5 key vocabulary words from each sentence.
-   Highlights key vocabulary with random colors (bold + underline) in both French and Chinese.
-   Creates a new page in Notion under the specified parent page.
-   Displays each sentence with its translation in a two-column layout (French | Chinese).
-   Includes a vocabulary list at the end with color-coded terms and a fill-in-the-blank practice section.
-   Caches Azure OpenAI translation/vocabulary output per article title to skip repeated LLM calls on subsequent runs.
-   Generates Azure Speech audio files for every sentence plus a full-article track, caching them on disk (audio stays local and is not embedded in Notion).
-   Builds adaptive practice exercises (fill-in-the-blank, multiple choice, listening) and saves them to `output/exercises` for use outside Notion.
-   Coordinates sentence translation, vocabulary extraction, audio, and highlighting via a LangChain workflow so each step can be extended or reused.

## Workflow Details

The generation flow is implemented as a LangChain workflow (`buildArticleWorkflow`) that chains three runnable steps:

1. **Sentence Splitter (`splitStep`)** – Takes the raw article text, splits it into French sentences, and validates that the article isn't empty.

2. **Translation Chain (`translationStep`)** – For each sentence, runs a LangChain `AzureChatOpenAI` structured-output chain that returns the Chinese translation plus 3–5 vocabulary pairs. Sentences are processed **in parallel** for improved performance. Results are cached to skip repeated LLM calls.

3. **Enrichment & Audio (`enrichmentStep`)** – Assigns highlight colors, generates optional Azure Speech `.wav` files (also in parallel), and packages the result into a `ProcessedArticle` consumed by the Notion/PDF exporters.

### Grammar Analysis Chain

A separate LangChain workflow (`analyzeGrammarHighlights`) analyzes the full article to:
- Determine CEFR difficulty level (A1, A2, B1, B2)
- Extract 3-5 key grammar patterns with explanations in Chinese

Because the workflow is composed with LangChain's runnable abstractions, you can inject additional steps (e.g., quizzes, flashcards) or swap in different models without touching the CLI entry point.

## LLM Output Cache

- Every time an article is processed, the raw translation + vocabulary data returned by Azure OpenAI is stored inside the `cache/` folder (one JSON file per title).
- When the same file/title is processed again, the tool reuses the cached LLM data and only reassigns highlight colors before creating Notion documents.
- If you edit the source text but keep the same filename, the script automatically detects that the cached French sentences no longer match and regenerates the translations.
- To force a fresh run manually, delete the corresponding file inside `cache/` (or remove the entire folder) before running `npm start`.

## Audio Pronunciation Files

- When `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are configured, the script uses Azure Cognitive Services Speech to synthesize each French sentence *and* a full-article `.wav` with the configured `AZURE_SPEECH_VOICE` (defaults to `fr-FR-VivienneNeural`).
- Audio files are stored under `output/audio/<article-title>/sentence-XX_<voice>.wav` plus `article-full_<voice>.wav`. Paths are logged to the console, but clips are not attached to Notion; play or upload them wherever you prefer.
- Audio generation is cached: existing `.wav` files are reused automatically, and only missing clips are synthesized on later runs.

## Adaptive Exercise Builder

- After an article is processed, a LangChain workflow plans which practice items to create based on sentence complexity and available audio.
- Exercise types currently include fill-in-the-blank, multiple choice, and listening prompts that reference the cached audio files.
- Generated exercises are written as JSON to `output/exercises/<article>.json`, so you can import them into flashcard tools or custom study apps without affecting the Notion page layout.
