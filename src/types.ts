export interface VocabularyItem {
    french: string;
    lemma?: string;
    chinese: string;
    partOfSpeech?: string;
    colorIndex: number;
}

export interface Segment {
    french: string;
    chinese: string;
    vocabulary: VocabularyItem[];
    audioFilePath?: string;
}

export type DifficultyLevel = 'A1' | 'A2' | 'B1' | 'B2';

export interface GrammarHighlight {
    title: string;
    pattern: string;
    explanation: string;
    exampleFrench: string;
    exampleChinese: string;
}

export interface ProcessedArticle {
    title: string;
    segments: Segment[];
    difficultyLevel?: DifficultyLevel | string;
    grammarHighlights?: GrammarHighlight[];
}
