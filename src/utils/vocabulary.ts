import { VocabularyItem } from '../types';

export const dedupeVocabulary = (vocabulary: VocabularyItem[]): VocabularyItem[] => {
  if (!vocabulary || vocabulary.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const deduped: VocabularyItem[] = [];

  vocabulary.forEach(item => {
    const key = (item.lemma || item.french || '').trim().toLowerCase();
    if (!key) {
      return;
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  });

  return deduped;
};
