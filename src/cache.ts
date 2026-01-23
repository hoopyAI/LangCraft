import * as fs from 'fs';
import * as path from 'path';
import { VocabularyPair } from './translator';
import { GrammarHighlight, DifficultyLevel } from './types';

export interface CachedLLMSegment {
  french: string;
  translation: string;
  vocabulary: VocabularyPair[];
  audioFilePath?: string;
}

export interface CachedLLMArticle {
  title: string;
  segments: CachedLLMSegment[];
  grammarHighlights?: GrammarHighlight[];
  difficultyLevel?: DifficultyLevel | string;
  updatedAt: string;
}

const resolveCacheDir = () => {
  const base = process.env.CACHE_DIR
    ? path.resolve(process.env.CACHE_DIR)
    : path.join(__dirname, '..', 'cache');
  return base;
};

const ensureCacheDir = () => {
  const dir = resolveCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const sanitizeFileName = (title: string) => {
  return title.trim().length > 0
    ? title.replace(/[^a-z0-9-_]+/gi, '_')
    : 'untitled';
};

const getCacheFilePath = (title: string) => {
  const safe = sanitizeFileName(title);
  return path.join(resolveCacheDir(), `${safe}.json`);
};

export const loadCachedLLMArticle = (title: string): CachedLLMArticle | null => {
  try {
    ensureCacheDir();
    const filePath = getCacheFilePath(title);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as CachedLLMArticle;
    if (!parsed || !Array.isArray(parsed.segments)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn(`Failed to read cache for ${title}:`, error);
    return null;
  }
};

export const saveCachedLLMArticle = (title: string, data: Omit<CachedLLMArticle, 'title' | 'updatedAt'>) => {
  try {
    ensureCacheDir();
    const filePath = getCacheFilePath(title);
    const payload: CachedLLMArticle = {
      title,
      updatedAt: new Date().toISOString(),
      segments: data.segments,
      grammarHighlights: data.grammarHighlights,
      difficultyLevel: data.difficultyLevel
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`Failed to write cache for ${title}:`, error);
  }
};
