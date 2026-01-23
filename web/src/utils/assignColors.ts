import { NOTION_COLORS } from '@core/utils/colors';
import { VocabularyItem } from '@core/types';
import { VocabularyPair } from '@core/translator';

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const assignColorsToVocabulary = (vocabulary: VocabularyPair[]): VocabularyItem[] => {
  if (!Array.isArray(vocabulary) || vocabulary.length === 0) {
    return [];
  }

  return vocabulary.map((item, index) => {
    const key = (item.lemma || item.french || item.chinese || `${index}`).toLowerCase();
    const colorIndex = hashString(key) % NOTION_COLORS.length;
    return {
      ...item,
      colorIndex,
    };
  });
};
